using Microsoft.Win32;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Forms=System.Windows.Forms;
using Button=System.Windows.Controls.Button;
using Brush=System.Windows.Media.Brush;
using Brushes=System.Windows.Media.Brushes;
using Color=System.Windows.Media.Color;
using ColorConverter=System.Windows.Media.ColorConverter;
using MessageBox=System.Windows.MessageBox;

namespace ConvoyHub.Client;

public partial class MainWindow:Window
{
    readonly string dataDir=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"VTC Truck Hub");
    string SettingsPath=>Path.Combine(dataDir,"settings.json"); string QueuePath=>Path.Combine(dataDir,"offline-queue.jsonl"); string LogPath=>Path.Combine(dataDir,"client.log"); string RecoveryPath=>Path.Combine(dataDir,"active-trip.json");
    readonly CancellationTokenSource shutdown=new(); readonly HttpClient http; readonly Forms.NotifyIcon tray;
    UdpClient? udp; ClientSettings settings=new(); TelemetryPacket current=new(); long packetCount,syncedCount; string? etsPath,atsPath; TripState trip=new(); bool forceClose,gameWasRunning,warnWasActive; int tripPoints;
    readonly Button[] navButtons; DateTime lastSent=DateTime.MinValue;

    public MainWindow()
    {
        InitializeComponent(); Directory.CreateDirectory(dataDir); settings=Load<ClientSettings>(SettingsPath)??new();
        var handler=new HttpClientHandler{CookieContainer=new CookieContainer()};http=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(8)};
        navButtons=[NavOverview,NavTelemetry,NavTrip,NavPlugin,NavLogs,NavSettings];
        settings.VtcKeys??=new();settings.Memberships??=new();if(settings.ApiUrl.Contains("localhost",StringComparison.OrdinalIgnoreCase))settings.ApiUrl="https://vtc-truck-hub.de";if(settings.ApiKey=="demo-client-key")settings.ApiKey="";VtcCombo.Items.Clear();VtcCombo.SelectionChanged+=VtcCombo_SelectionChanged;foreach(var membership in settings.Memberships)VtcCombo.Items.Add(membership);if(VtcCombo.Items.Count>0){var stored=VtcCombo.Items.Cast<VtcChoice>().Select((choice,index)=>(choice,index)).FirstOrDefault(x=>x.choice.Id==settings.ActiveVtcId);VtcCombo.SelectedIndex=stored.choice is null?0:stored.index;}ApiUrlBox.Text=settings.ApiUrl;ApiUrlBox.IsReadOnly=true;ApiKeyBox.Password=settings.ApiKey;ApiKeyBox.IsEnabled=false;ApiKeyBox.ToolTip="Der persönliche Schlüssel wird nach der Anmeldung automatisch und kontogebunden eingesetzt.";IntervalBox.Text=settings.SendIntervalMs.ToString();AutoStartCheck.IsChecked=settings.AutoStart;MinimizeTrayCheck.IsChecked=settings.MinimizeToTray;AutoSyncCheck.IsChecked=settings.AutoSync;AutoTripCheck.IsChecked=settings.AutoTrip;
        VersionText.Text=$"CLIENT v{Assembly.GetExecutingAssembly().GetName().Version?.ToString(3)}";
        tray=new Forms.NotifyIcon{Text="VTC Truck Hub Client",Visible=true,Icon=System.Drawing.SystemIcons.Application,ContextMenuStrip=new Forms.ContextMenuStrip()};
        tray.DoubleClick+=(_,_)=>Dispatcher.Invoke(ShowFromTray);tray.ContextMenuStrip.Items.Add("Öffnen",null,(_,_)=>Dispatcher.Invoke(ShowFromTray));tray.ContextMenuStrip.Items.Add("Beenden",null,(_,_)=>Dispatcher.Invoke(()=>{forceClose=true;Close();}));
        trip=Load<TripState>(RecoveryPath)??new();UpdateTripUi();LoadLog();
        Loaded+=async(_,_)=>{Log("Client gestartet");DetectGamePaths();await CheckServer();StartUdp();_ = MonitorGames();if(settings.AutoSync)_=FlushQueue();_ = CheckForUpdatesAsync();};
    }

    T? Load<T>(string path){try{return File.Exists(path)?JsonSerializer.Deserialize<T>(File.ReadAllText(path)):default;}catch{return default;}}
    void Save<T>(string path,T value)=>File.WriteAllText(path,JsonSerializer.Serialize(value,new JsonSerializerOptions{WriteIndented=true}));
    void Log(string message){var line=$"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {message}";File.AppendAllText(LogPath,line+Environment.NewLine);Dispatcher.Invoke(()=>{LogBox.AppendText(line+Environment.NewLine);LogBox.ScrollToEnd();});}
    void LoadLog(){if(File.Exists(LogPath))LogBox.Text=string.Join(Environment.NewLine,File.ReadLines(LogPath).TakeLast(300));}
    string Api(string path)=>settings.ApiUrl.TrimEnd('/')+path;

    async Task CheckServer(){try{var res=await http.GetAsync(Api("/api/v1/health"),shutdown.Token);var ok=res.IsSuccessStatusCode;ConnectionDot.Fill=new SolidColorBrush((Color)ColorConverter.ConvertFromString(ok?"#22D3C5":"#E76B6B"));ConnectionText.Text=ok?"SERVER VERBUNDEN":"SERVERFEHLER";ApiQuickState.Text=ok?"VERBUNDEN":"GETRENNT";Log(ok?"API-Verbindung hergestellt":"API antwortet mit Fehler");}catch(Exception e){ConnectionDot.Fill=Brushes.IndianRed;ConnectionText.Text="OFFLINE-MODUS";ApiQuickState.Text="GETRENNT";Log("API nicht erreichbar: "+e.Message);}}
    async Task MonitorGames(){while(!shutdown.IsCancellationRequested){var ets=Process.GetProcessesByName("eurotrucks2").Any();var ats=Process.GetProcessesByName("amtrucks").Any();var running=ets||ats;if(gameWasRunning&&!running&&trip.Active){current.Event="game.exited";await ProcessPacket(current);current.Event=null;trip.Status="Unterbrochen";Save(RecoveryPath,trip);await Dispatcher.InvokeAsync(UpdateTripUi);Log("Spiel beendet – aktiver Auftrag wurde unterbrochen und bleibt gespeichert.");}gameWasRunning=running;await Dispatcher.InvokeAsync(()=>{var name=ets?"ETS2":ats?"ATS":null;MetricGame.Text=name??"OFFLINE";GameStatusText.Text=name is null?"KEIN SPIEL ERKANNT":name+" LÄUFT";GameDot.Fill=new SolidColorBrush((Color)ColorConverter.ConvertFromString(name is null?"#52656F":"#22D3C5"));if(name!=null)current.Game=name;});await Task.Delay(2000,shutdown.Token).ContinueWith(_=>{});}}
    void StartUdp(){try{udp=new UdpClient(new IPEndPoint(IPAddress.Loopback,35055));Log("SCS-Bridge hört auf 127.0.0.1:35055");_=ReceiveUdp();}catch(Exception e){Log("UDP-Bridge konnte nicht starten: "+e.Message);}}
    async Task ReceiveUdp(){if(udp is null)return;while(!shutdown.IsCancellationRequested){try{var datagram=await udp.ReceiveAsync(shutdown.Token);var packet=JsonSerializer.Deserialize<TelemetryPacket>(datagram.Buffer,new JsonSerializerOptions{PropertyNameCaseInsensitive=true});if(packet is null)continue;current=packet;packetCount++;await Dispatcher.InvokeAsync(UpdateTelemetryUi);await ProcessPacket(packet);}catch(OperationCanceledException){break;}catch(Exception e){Log("Telemetry-Paket ungültig: "+e.Message);}}}
    string BuildJobKey(TelemetryPacket p)=>string.IsNullOrWhiteSpace(p.JobKey)?string.Join("|",p.Game,p.SourceCity,p.SourceCompany,p.DestinationCity,p.DestinationCompany,p.Cargo,Math.Round(p.CargoMass)):p.JobKey;
    async Task ProcessPacket(TelemetryPacket p)
    {
        if(string.IsNullOrWhiteSpace(settings.UserId)||string.IsNullOrWhiteSpace(SelectedVtc())||string.IsNullOrWhiteSpace(settings.ApiKey)){ApiQuickState.Text="KONFIGURATION FEHLT";ApiQuickState.Foreground=Brushes.Orange;return;}
        var jobKey=BuildJobKey(p);var hasJob=!string.IsNullOrWhiteSpace(p.Cargo)||!string.IsNullOrWhiteSpace(p.SourceCity)||!string.IsNullOrWhiteSpace(p.JobKey);
        if(settings.AutoTrip&&hasJob){if((p.Event=="job.started"&&trip.JobKey!=jobKey)||trip.Id is null)StartTrip(jobKey);else if(trip.JobKey==jobKey&&trip.Status=="Unterbrochen"){trip.Active=true;trip.Status="Fortgesetzt";Save(RecoveryPath,trip);Dispatcher.Invoke(UpdateTripUi);Log("Gespeicherter Auftrag erkannt und fortgesetzt: "+trip.Id);}}
        var lifecycleEvent=!string.IsNullOrWhiteSpace(p.Event);var elapsed=(DateTime.UtcNow-lastSent).TotalMilliseconds;if(!lifecycleEvent&&elapsed<settings.SendIntervalMs)return;lastSent=DateTime.UtcNow;
        var payload=new{tripId=trip.Id,jobKey,hasJob,@event=p.Event??"telemetry",vtcId=SelectedVtc(),userId=settings.UserId,game=p.Game is "ATS"?"ATS":"ETS2",latitude=MapLatitude(p),longitude=MapLongitude(p),gameX=p.WorldX,gameY=p.WorldY,gameZ=p.WorldZ,heading=p.Heading,speedKph=p.SpeedKph,rpm=p.Rpm,gear=p.Gear,fuelLiters=p.Fuel,fuelAverage=p.FuelAverage,fuelRange=p.FuelRange,odometerKm=p.Odometer,truckDamage=p.TruckDamage,trailerDamage=p.TrailerDamage,cargoDamage=p.CargoDamage,cruiseControl=p.CruiseControl,engineEnabled=p.EngineEnabled,parkingBrake=p.ParkingBrake,motorBrake=p.MotorBrake,retarderLevel=p.RetarderLevel,leftBlinker=p.LeftBlinker,rightBlinker=p.RightBlinker,hazardWarning=p.HazardWarning,lowBeam=p.LowBeam,highBeam=p.HighBeam,beacon=p.Beacon,brakeAirPressure=p.BrakeAirPressure,waterTemperature=p.WaterTemperature,batteryVoltage=p.BatteryVoltage,steeringInput=p.SteeringInput,throttleInput=p.ThrottleInput,brakeInput=p.BrakeInput,navigationDistance=p.NavigationDistance,navigationTime=p.NavigationTime,navigationSpeedLimitKph=p.NavigationSpeedLimitKph,gameTime=p.GameTime,cargo=p.Cargo,cargoMass=p.CargoMass,sourceCity=p.SourceCity,sourceCompany=p.SourceCompany,destinationCity=p.DestinationCity,destinationCompany=p.DestinationCompany,plannedDistanceKm=p.PlannedDistanceKm,gameIncomeCents=p.GameIncomeCents,truck=p.Truck,server=p.Server,recordedAt=DateTime.UtcNow};
        var json=JsonSerializer.Serialize(payload);var result=await Send(json);
        if(result.Ok){syncedCount++;if(!string.IsNullOrWhiteSpace(result.TripId)){trip.Id=result.TripId;trip.JobKey=jobKey;}tripPoints=Math.Max(tripPoints,result.PointsTotal);if(result.Lifecycle=="pending_driver"){await Dispatcher.InvokeAsync(CompleteTrip);await Dispatcher.InvokeAsync(async()=>{if(MessageBox.Show("Der Auftrag wurde geliefert. Möchtest du die Abrechnung jetzt bestätigen und zur Lohnzahlung einreichen?","VTC Truck Hub Abrechnung",MessageBoxButton.YesNo,MessageBoxImage.Question)==MessageBoxResult.Yes)await ConfirmInvoiceAsync();});}else if(result.Lifecycle=="cancelled")await Dispatcher.InvokeAsync(AbortTrip);else if(result.Lifecycle=="interrupted"){trip.Status="Unterbrochen";trip.Active=true;}Save(RecoveryPath,trip);Dispatcher.Invoke(()=>{MetricSynced.Text=syncedCount.ToString();PointCounterText.Text=$"{tripPoints} PUNKTE";UpdateTripUi();});}
        else{File.AppendAllText(QueuePath,json+Environment.NewLine);Dispatcher.Invoke(UpdateQueueCount);}
    }
    async Task ConfirmInvoiceAsync(){if(string.IsNullOrWhiteSpace(trip.Id))return;try{var json=JsonSerializer.Serialize(new{action="confirmTrip",tripId=trip.Id});var res=await http.PostAsync(Api("/api/v1/payroll"),new StringContent(json,Encoding.UTF8,"application/json"));if(!res.IsSuccessStatusCode){var error=await res.Content.ReadAsStringAsync();MessageBox.Show("Die Abrechnung konnte nicht bestätigt werden. "+error,"VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Warning);return;}trip.Status="Abrechnung bestätigt – wartet auf Lohnfreigabe";Save(RecoveryPath,trip);UpdateTripUi();MessageBox.Show("Abrechnung bestätigt. Sie wartet jetzt im Lohnbüro deiner Spedition auf Freigabe.","VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Information);Log("Abrechnung zur Lohnfreigabe eingereicht: "+trip.Id);}catch(Exception ex){Log("Abrechnungsbestätigung fehlgeschlagen: "+ex.Message);MessageBox.Show("Server nicht erreichbar. Bitte später im Fahrtenbuch bestätigen.","VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Warning);}}
    static double MapLatitude(TelemetryPacket p)=>Math.Clamp((p.Game=="ATS"?39:51)-p.WorldZ/500000d,-85,85);static double MapLongitude(TelemetryPacket p)=>Math.Clamp((p.Game=="ATS"?-100:10)+p.WorldX/500000d,-180,180);
    async Task<SendResult> Send(string json){try{using var req=new HttpRequestMessage(HttpMethod.Post,Api("/api/v1/telemetry")){Content=new StringContent(json,Encoding.UTF8,"application/json")};req.Headers.Authorization=new AuthenticationHeaderValue("Bearer",settings.ApiKey);var res=await http.SendAsync(req,shutdown.Token);if(!res.IsSuccessStatusCode)return new(false);var response=await res.Content.ReadAsStringAsync();using var doc=JsonDocument.Parse(response);var root=doc.RootElement;var points=root.TryGetProperty("points",out var p)&&p.TryGetProperty("total",out var total)?total.GetInt32():0;return new(true,root.TryGetProperty("tripId",out var id)?id.GetString():null,root.TryGetProperty("lifecycle",out var lc)?lc.GetString():null,points);}catch{return new(false);}}
    async Task FlushQueue(){if(!File.Exists(QueuePath))return;var lines=await File.ReadAllLinesAsync(QueuePath);var remaining=new List<string>();foreach(var line in lines)if(!(await Send(line)).Ok)remaining.Add(line);await File.WriteAllLinesAsync(QueuePath,remaining);Dispatcher.Invoke(UpdateQueueCount);Log($"Offline-Synchronisierung: {lines.Length-remaining.Count} übertragen, {remaining.Count} verbleibend");}
    void UpdateQueueCount()=>MetricQueued.Text=(File.Exists(QueuePath)?File.ReadLines(QueuePath).Count():0).ToString();

    void UpdateTelemetryUi(){MetricPackets.Text=packetCount.ToString();SpeedRun.Text=current.SpeedKph.ToString("0");RpmRun.Text=current.Rpm.ToString("0");GearText.Text=current.Gear==0?"N":current.Gear.ToString();PositionText.Text=$"X {current.WorldX:0.0}  ·  Y {current.WorldY:0.0}  ·  Z {current.WorldZ:0.0}";HeadingText.Text=$"Fahrtrichtung {current.Heading:0}°";PacketTimeText.Text="Signal "+DateTime.Now.ToString("HH:mm:ss");FuelText.Text=$"{current.Fuel:0.0} l";ConsumptionText.Text=$"{current.FuelAverage:0.0} l/100 km";CruiseText.Text=current.CruiseControl?"Aktiv":"Aus";NavDistanceText.Text=$"{current.NavigationDistance/1000:0.0} km";EngineText.Text=current.EngineEnabled?"Läuft":"Aus";TruckDamageText.Text=$"{current.TruckDamage*100:0.0} %";TrailerDamageText.Text=$"{current.TrailerDamage*100:0.0} %";GameTimeText.Text=TimeSpan.FromMinutes(current.GameTime).ToString(@"hh\:mm");CargoText.Text=string.IsNullOrWhiteSpace(current.Cargo)?"Kein Auftrag":current.Cargo;SourceText.Text=current.SourceCity??"—";DestinationText.Text=current.DestinationCity??"—";CargoMassText.Text=$"{current.CargoMass/1000:0.0} t";TripRouteText.Text=$"{SourceText.Text} → {DestinationText.Text}";TripCargoText.Text=CargoText.Text;TripDistanceText.Text=$"{current.Odometer:0.0} km Kilometerstand";var speed=current.SpeedKph;if(speed>=95){SpeedWarningPanel.Background=new SolidColorBrush((Color)ColorConverter.ConvertFromString(speed>=110?"#4A2025":"#4A361C"));SpeedWarningPanel.BorderBrush=speed>=110?Brushes.IndianRed:Brushes.Orange;SpeedWarningText.Text=speed>=110?"KRITISCHE GESCHWINDIGKEIT":"TEMPO ÜBERSCHRITTEN – PUNKTE AKTIV";SpeedWarningText.Foreground=speed>=110?Brushes.IndianRed:Brushes.Orange;SpeedWarningDetail.Text=$"{speed:0} km/h · Punkte werden nach 3 Sekunden serverseitig gezählt.";if(!warnWasActive){tray.ShowBalloonTip(3000,"VTC Truck Hub Geschwindigkeitswarnung",$"{speed:0} km/h – ab jetzt können Punkte entstehen.",Forms.ToolTipIcon.Warning);warnWasActive=true;}}else if(speed>=90){SpeedWarningPanel.Background=new SolidColorBrush((Color)ColorConverter.ConvertFromString("#29321C"));SpeedWarningPanel.BorderBrush=Brushes.Goldenrod;SpeedWarningText.Text="VORWARNUNG";SpeedWarningText.Foreground=Brushes.Goldenrod;SpeedWarningDetail.Text=$"{speed:0} km/h · Bei 95 km/h beginnt die Punkteerfassung.";warnWasActive=false;}else{SpeedWarningPanel.Background=new SolidColorBrush((Color)ColorConverter.ConvertFromString("#132936"));SpeedWarningPanel.BorderBrush=new SolidColorBrush((Color)ColorConverter.ConvertFromString("#2A414D"));SpeedWarningText.Text="SICHERE FAHRT";SpeedWarningText.Foreground=(Brush)FindResource("Teal");SpeedWarningDetail.Text="Ab 95 km/h beginnt die Punkteerfassung.";warnWasActive=false;}PointCounterText.Text=$"{tripPoints} PUNKTE";AnomalyText.Text=speed>=95?"Geschwindigkeitsverstoß wird erfasst":current.TruckDamage>.75?"Extremer Fahrzeugschaden":"Keine Auffälligkeiten";AnomalyText.Foreground=speed>=95||current.TruckDamage>.75?Brushes.Orange:(Brush)FindResource("Teal");}

    void DetectGamePaths(){etsPath=FindGame("Euro Truck Simulator 2","227300");atsPath=FindGame("American Truck Simulator","270880");EtsPathText.Text=etsPath??"Installation nicht automatisch gefunden";AtsPathText.Text=atsPath??"Installation nicht automatisch gefunden";UpdatePluginState();}
    static string? FindGame(string folder,string appId){var candidates=new List<string>();var steam=Registry.CurrentUser.OpenSubKey($@"Software\Valve\Steam\Apps\{appId}")?.GetValue("Installed") as int?;var pf=Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);candidates.Add(Path.Combine(pf,"Steam","steamapps","common",folder));var reg=Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam")?.GetValue("SteamPath")?.ToString();if(reg!=null)candidates.Add(Path.Combine(reg,"steamapps","common",folder));return candidates.FirstOrDefault(Directory.Exists);}
    string PluginSource()=>Path.Combine(AppContext.BaseDirectory,"plugins","convoyhub_scs.dll");string? PluginTarget(string? game)=>game is null?null:Path.Combine(game,"bin","win_x64","plugins","convoyhub_scs.dll");
    void UpdatePluginState(){void Set(TextBlock block,string? path){var file=PluginTarget(path);var ok=file!=null&&File.Exists(file);block.Text=ok?"Plugin installiert und bereit":"Plugin nicht installiert";block.Foreground=ok?(Brush)FindResource("Teal"):Brushes.Orange;}Set(EtsPluginText,etsPath);Set(AtsPluginText,atsPath);var any=(PluginTarget(etsPath) is string e&&File.Exists(e))||(PluginTarget(atsPath) is string a&&File.Exists(a));PluginQuickState.Text=any?"BEREIT":"NICHT INSTALLIERT";PluginQuickState.Foreground=any?(Brush)FindResource("Teal"):Brushes.Orange;}
    void InstallPlugin(string game){var path=game=="ETS2"?etsPath:atsPath;var target=PluginTarget(path);var source=PluginSource();if(path is null||target is null){MessageBox.Show("Die Spielinstallation wurde nicht gefunden.","VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Warning);return;}if(!File.Exists(source)){MessageBox.Show("Die native Plugin-DLL ist noch nicht im Client-Paket vorhanden. Bitte installiere den vollständigen VTC-Truck-Hub-Client.","VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Warning);return;}Directory.CreateDirectory(Path.GetDirectoryName(target)!);File.Copy(source,target,true);Log($"Plugin für {game} installiert: {target}");UpdatePluginState();MessageBox.Show("Plugin installiert. Starte das Spiel neu und bestätige den SCS-SDK-Hinweis.","VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Information);}
    static void StartUri(string uri){Process.Start(new ProcessStartInfo(uri){UseShellExecute=true});}
    string SelectedVtc()=>Dispatcher.CheckAccess()?(VtcCombo.SelectedItem as VtcChoice)?.Id??"":Dispatcher.Invoke(SelectedVtc);

    async void Login_Click(object sender,RoutedEventArgs e){try{AccountState.Text="Konto wird verbunden …";var json=JsonSerializer.Serialize(new{email=EmailBox.Text.Trim(),password=PasswordInput.Password});var res=await http.PostAsync(Api("/api/auth/login"),new StringContent(json,Encoding.UTF8,"application/json"));if(!res.IsSuccessStatusCode){AccountState.Text=await ReadApiError(res,"Anmeldung fehlgeschlagen");return;}var doc=JsonDocument.Parse(await res.Content.ReadAsStringAsync());var user=doc.RootElement.GetProperty("user");ApplyAuthenticatedUser(user);await LoadAccountBindingAsync();Log("Konto mit E-Mail und Passwort angemeldet und Spedition verbunden");}catch(Exception ex){AccountState.Text="Server nicht erreichbar";Log("Login fehlgeschlagen: "+ex.Message);}}
    async void OAuthLogin_Click(object sender,RoutedEventArgs e)
    {
        var provider=((Button)sender).Tag?.ToString()??"";
        try
        {
            AccountState.Text=$"{char.ToUpper(provider[0])}{provider[1..]} wird im Browser geöffnet …";
            var response=await http.PostAsync(Api("/api/auth/desktop"),new StringContent(JsonSerializer.Serialize(new{provider}),Encoding.UTF8,"application/json"));
            if(!response.IsSuccessStatusCode){AccountState.Text=await ReadApiError(response,$"{provider}-Anmeldung konnte nicht gestartet werden");Log($"{provider}-Start fehlgeschlagen: HTTP {(int)response.StatusCode}");return;}
            using var start=JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            var token=start.RootElement.GetProperty("token").GetString()??"";
            var verificationUrl=start.RootElement.GetProperty("verificationUrl").GetString()??"";
            if(string.IsNullOrWhiteSpace(token)||string.IsNullOrWhiteSpace(verificationUrl)){AccountState.Text="Anmeldeanforderung ist unvollständig";return;}
            StartUri(verificationUrl);
            AccountState.Text="Browser-Anmeldung bestätigen – der Client wartet …";
            for(var attempt=0;attempt<120&&!shutdown.IsCancellationRequested;attempt++)
            {
                await Task.Delay(2500,shutdown.Token);
                var poll=await http.GetAsync(Api($"/api/auth/desktop?token={Uri.EscapeDataString(token)}"),shutdown.Token);
                if(!poll.IsSuccessStatusCode)continue;
                using var result=JsonDocument.Parse(await poll.Content.ReadAsStringAsync());
                if(result.RootElement.GetProperty("status").GetString()!="approved")continue;
                ApplyAuthenticatedUser(result.RootElement.GetProperty("user"));
                ApplyMemberships(result.RootElement);
                Log($"Konto mit {provider} angemeldet");
                return;
            }
            AccountState.Text="Browser-Anmeldung abgelaufen – bitte erneut versuchen";
        }
        catch(OperationCanceledException){}
        catch(Exception ex){AccountState.Text="Browser-Anmeldung fehlgeschlagen";Log($"{provider}-Login fehlgeschlagen: "+ex.Message);}
    }
    static async Task<string> ReadApiError(HttpResponseMessage response,string fallback){var raw=await response.Content.ReadAsStringAsync();try{using var doc=JsonDocument.Parse(raw);if(doc.RootElement.TryGetProperty("error",out var error)&&!string.IsNullOrWhiteSpace(error.GetString()))return error.GetString()!;}catch{}return $"{fallback} (HTTP {(int)response.StatusCode})";}
    void ApplyAuthenticatedUser(JsonElement user){settings.UserId=user.GetProperty("id").GetString()??"";settings.DriverName=user.TryGetProperty("displayName",out var name)?name.GetString()??"Fahrer":"Fahrer";settings.AccountEmail=user.TryGetProperty("email",out var email)?email.GetString()??"":"";AccountState.Text=$"Angemeldet als {settings.DriverName}";Save(SettingsPath,settings);}
    async Task LoadAccountBindingAsync()
    {
        var response=await http.GetAsync(Api("/api/v1/client-access"),shutdown.Token);
        if(!response.IsSuccessStatusCode){AccountState.Text=await ReadApiError(response,"Speditionszuordnung konnte nicht geladen werden");return;}
        using var document=JsonDocument.Parse(await response.Content.ReadAsStringAsync(shutdown.Token));
        if(document.RootElement.TryGetProperty("memberships",out var memberships))foreach(var membership in memberships.EnumerateArray())
        {
            var id=membership.TryGetProperty("id",out var idNode)?idNode.GetString():null;
            if(string.IsNullOrWhiteSpace(id)||settings.VtcKeys.ContainsKey(id))continue;
            var issue=await http.PostAsync(Api("/api/v1/client-access"),new StringContent(JsonSerializer.Serialize(new{vtcId=id}),Encoding.UTF8,"application/json"),shutdown.Token);
            if(!issue.IsSuccessStatusCode){Log($"Clientschlüssel für {id} konnte nicht erzeugt werden: HTTP {(int)issue.StatusCode}");continue;}
            using var issued=JsonDocument.Parse(await issue.Content.ReadAsStringAsync(shutdown.Token));
            if(issued.RootElement.TryGetProperty("key",out var key)&&!string.IsNullOrWhiteSpace(key.GetString()))settings.VtcKeys[id]=key.GetString()!;
        }
        ApplyMemberships(document.RootElement);
    }
    void ApplyMemberships(JsonElement response)
    {
        if(response.TryGetProperty("apiBase",out var apiBase)&&Uri.TryCreate(apiBase.GetString(),UriKind.Absolute,out var uri)){settings.ApiUrl=uri.GetLeftPart(UriPartial.Authority);ApiUrlBox.Text=settings.ApiUrl;}
        VtcCombo.Items.Clear();settings.Memberships.Clear();
        if(response.TryGetProperty("memberships",out var memberships))foreach(var membership in memberships.EnumerateArray())
        {
            string id=membership.TryGetProperty("id",out var idNode)?idNode.GetString()??"":"",name=membership.TryGetProperty("name",out var nameNode)?nameNode.GetString()??"Spedition":"Spedition",tag=membership.TryGetProperty("tag",out var tagNode)?tagNode.GetString()??"VTC":"VTC",role=membership.TryGetProperty("roleName",out var roleNode)?roleNode.GetString()??"Fahrer":"Fahrer";
            if(string.IsNullOrWhiteSpace(id))continue;
            if(membership.TryGetProperty("clientKey",out var keyNode)&&!string.IsNullOrWhiteSpace(keyNode.GetString()))settings.VtcKeys[id]=keyNode.GetString()!;
            var choice=new VtcChoice(id,name,tag,role);settings.Memberships.Add(choice);VtcCombo.Items.Add(choice);
        }
        if(VtcCombo.Items.Count>0){var preferred=VtcCombo.Items.Cast<VtcChoice>().Select((choice,index)=>(choice,index)).FirstOrDefault(x=>x.choice.Id==settings.ActiveVtcId);VtcCombo.SelectedIndex=preferred.choice is null?0:preferred.index;AccountState.Text=$"{settings.DriverName} · Spedition und Clientschlüssel verbunden";}else{settings.ActiveVtcId="";settings.ApiKey="";ApiKeyBox.Password="";CompanyTagText.Text="VTC";CompanyNameText.Text="Keine Spedition zugeordnet";CompanyRoleText.Text="Bitte einer Spedition beitreten";AccountState.Text="Angemeldet, aber noch keiner Spedition zugeordnet";}
        Save(SettingsPath,settings);
    }
    void VtcCombo_SelectionChanged(object sender,SelectionChangedEventArgs e)
    {
        if(VtcCombo.SelectedItem is not VtcChoice choice)return;
        settings.ActiveVtcId=choice.Id;settings.ApiKey=settings.VtcKeys.TryGetValue(choice.Id,out var key)?key:"";ApiKeyBox.Password=settings.ApiKey;CompanyTagText.Text=choice.Tag;CompanyNameText.Text=choice.Name;CompanyRoleText.Text=choice.RoleName;Save(SettingsPath,settings);
        if(string.IsNullOrWhiteSpace(settings.ApiKey)){AccountState.Text=$"{choice.Name}: Clientschlüssel fehlt – bitte erneut anmelden";ApiQuickState.Text="SCHLÜSSEL FEHLT";}else{AccountState.Text=$"{settings.DriverName} · {choice.Name} verbunden";ApiQuickState.Text="KONTO VERBUNDEN";}
    }
    async Task CheckForUpdatesAsync(bool manual=false)
    {
        try
        {
            UpdateQuickState.Text="PRÜFUNG …";UpdateQuickState.Foreground=Brushes.Goldenrod;
            using var updateClient=new HttpClient{Timeout=TimeSpan.FromSeconds(20)};
            updateClient.DefaultRequestHeaders.UserAgent.ParseAdd("VTC-Truck-Hub-Client/1.0");
            updateClient.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
            var response=await updateClient.GetAsync("https://api.github.com/repos/PeckolinoAkJan/vtc-truck-hub/releases/latest",shutdown.Token);
            if(!response.IsSuccessStatusCode){UpdateQuickState.Text="NICHT ERREICHBAR";if(manual)MessageBox.Show("Die GitHub-Releaseprüfung ist derzeit nicht erreichbar.","VTC Truck Hub Update",MessageBoxButton.OK,MessageBoxImage.Information);return;}
            using var release=JsonDocument.Parse(await response.Content.ReadAsStringAsync(shutdown.Token));
            var tag=release.RootElement.GetProperty("tag_name").GetString()?.Trim().TrimStart('v','V')??"";
            if(!Version.TryParse(tag,out var latest)){UpdateQuickState.Text="VERSION UNKLAR";return;}
            var currentVersion=Assembly.GetExecutingAssembly().GetName().Version??new Version(0,0,0);
            var current=new Version(currentVersion.Major,currentVersion.Minor,Math.Max(0,currentVersion.Build));
            var available=new Version(latest.Major,latest.Minor,Math.Max(0,latest.Build));
            if(available<=current){UpdateQuickState.Text="AKTUELL";UpdateQuickState.Foreground=(Brush)FindResource("Teal");if(manual)MessageBox.Show($"Version {current} ist aktuell.","VTC Truck Hub Update",MessageBoxButton.OK,MessageBoxImage.Information);return;}
            var asset=release.RootElement.GetProperty("assets").EnumerateArray().FirstOrDefault(x=>(x.GetProperty("name").GetString()??"").Contains("Setup",StringComparison.OrdinalIgnoreCase)&&(x.GetProperty("name").GetString()??"").EndsWith(".exe",StringComparison.OrdinalIgnoreCase));
            if(asset.ValueKind==JsonValueKind.Undefined){UpdateQuickState.Text=$"v{available} OHNE PAKET";return;}
            var download=asset.GetProperty("browser_download_url").GetString()??"";
            var digest=asset.TryGetProperty("digest",out var digestValue)?digestValue.GetString():null;
            if(!Uri.TryCreate(download,UriKind.Absolute,out var downloadUri)||downloadUri.Scheme!="https"||downloadUri.Host is not ("github.com" or "objects.githubusercontent.com")){UpdateQuickState.Text="PAKET UNGÜLTIG";return;}
            UpdateQuickState.Text=$"v{available} VERFÜGBAR";UpdateQuickState.Foreground=Brushes.Orange;
            if(MessageBox.Show($"VTC Truck Hub Client {available} ist verfügbar. Jetzt sicher herunterladen und installieren?","VTC Truck Hub Update",MessageBoxButton.YesNo,MessageBoxImage.Information)!=MessageBoxResult.Yes)return;
            await InstallUpdateAsync(downloadUri,digest,available);
        }
        catch(OperationCanceledException){}
        catch(Exception ex){UpdateQuickState.Text="UPDATEFEHLER";UpdateQuickState.Foreground=Brushes.IndianRed;Log("Updateprüfung fehlgeschlagen: "+ex.Message);if(manual)MessageBox.Show("Das Update konnte nicht geprüft oder installiert werden. Details stehen im Diagnoseprotokoll.","VTC Truck Hub Update",MessageBoxButton.OK,MessageBoxImage.Warning);}
    }
    async Task InstallUpdateAsync(Uri downloadUri,string? expectedDigest,Version version)
    {
        UpdateQuickState.Text="DOWNLOAD …";
        var root=Path.Combine(dataDir,"updates",version.ToString());
        var zip=Path.Combine(root,"VTC-Truck-Hub-Setup.exe");
        Directory.CreateDirectory(root);
        using(var downloadClient=new HttpClient{Timeout=TimeSpan.FromMinutes(15)})
        {
            downloadClient.DefaultRequestHeaders.UserAgent.ParseAdd("VTC-Truck-Hub-Client/1.0");
            await using var source=await downloadClient.GetStreamAsync(downloadUri,shutdown.Token);
            await using var target=File.Create(zip);
            await source.CopyToAsync(target,shutdown.Token);
        }
        if(!string.IsNullOrWhiteSpace(expectedDigest)&&expectedDigest.StartsWith("sha256:",StringComparison.OrdinalIgnoreCase))
        {
            await using var input=File.OpenRead(zip);var hash=Convert.ToHexString(await SHA256.HashDataAsync(input,shutdown.Token));
            if(!hash.Equals(expectedDigest[7..],StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("SHA-256-Prüfsumme des Releasepakets stimmt nicht.");
        }
        Process.Start(new ProcessStartInfo(zip,"/SILENT /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS"){UseShellExecute=true});
        forceClose=true;Log($"Setup-Update {version} geprüft und gestartet.");System.Windows.Application.Current.Shutdown();
    }
    async void CheckUpdate_Click(object sender,RoutedEventArgs e)=>await CheckForUpdatesAsync(true);
    void Nav_Click(object sender,RoutedEventArgs e){var b=(Button)sender;Pages.SelectedIndex=int.Parse(b.CommandParameter.ToString()!);foreach(var n in navButtons)n.Tag=null;b.Tag="active";HeaderTitle.Text=((string)b.Content).TrimStart('⌂','◉','▰','⚙','≣','◫',' ');}
    void StartEts2_Click(object sender,RoutedEventArgs e)=>StartUri("steam://run/227300");void StartAts_Click(object sender,RoutedEventArgs e)=>StartUri("steam://run/270880");
    void DetectGames_Click(object sender,RoutedEventArgs e)=>DetectGamePaths();void InstallPlugin_Click(object sender,RoutedEventArgs e)=>InstallPlugin(((Button)sender).Tag?.ToString()??"ETS2");
    void OpenDiagnostics_Click(object sender,RoutedEventArgs e){Pages.SelectedIndex=4;Nav_Click(NavLogs,e);}void RunDiagnostics_Click(object sender,RoutedEventArgs e){DetectGamePaths();UpdateQueueCount();DiagnosticSummary.Text=$"API: {ApiQuickState.Text} · ETS2: {(etsPath!=null?"gefunden":"fehlt")} · ATS: {(atsPath!=null?"gefunden":"fehlt")} · Plugin: {PluginQuickState.Text} · UDP: {(udp!=null?"aktiv":"inaktiv")}";Log("Diagnose aktualisiert");}
    void OpenLogs_Click(object sender,RoutedEventArgs e)=>Process.Start(new ProcessStartInfo("explorer.exe",dataDir){UseShellExecute=true});void PrepareReport_Click(object sender,RoutedEventArgs e){var report=Path.Combine(dataDir,$"diagnose-{DateTime.Now:yyyyMMdd-HHmmss}.txt");File.WriteAllText(report,$"VTC Truck Hub Diagnose\nVersion: {VersionText.Text}\nAPI: {ApiQuickState.Text}\nGame: {GameStatusText.Text}\nPlugin: {PluginQuickState.Text}\n\n{LogBox.Text}");Log("Diagnosebericht erstellt: "+report);MessageBox.Show("Der Diagnosebericht wurde lokal erstellt. Es wurden keine Daten versendet.","VTC Truck Hub");}async void SyncNow_Click(object sender,RoutedEventArgs e)=>await FlushQueue();
    void StartTrip(string? jobKey=null){trip=new TripState{Id=Guid.NewGuid().ToString(),JobKey=jobKey,Active=true,Status="Gestartet",StartedAt=DateTime.UtcNow};tripPoints=0;Save(RecoveryPath,trip);UpdateTripUi();Log("Fahrt gestartet: "+trip.Id);}void PauseTrip(){if(!trip.Active)return;trip.Status="Pausiert";Save(RecoveryPath,trip);UpdateTripUi();}void ResumeTrip(){if(!trip.Active)return;trip.Status="Gestartet";Save(RecoveryPath,trip);UpdateTripUi();}void CompleteTrip(){trip.Status="Wartet auf Bestätigung und Lohnabrechnung";trip.Active=false;Save(RecoveryPath,trip);UpdateTripUi();Log("Fahrt geliefert – Abrechnung wartet auf Fahrerbestätigung: "+trip.Id);}void AbortTrip(){trip.Status="Auftrag abgebrochen – keine Lohnzahlung";trip.Active=false;Save(RecoveryPath,trip);UpdateTripUi();Log("Fahrt abgebrochen: "+trip.Id);}void UpdateTripUi(){TripStatusText.Text=trip.Active?$"Fahrt {trip.Status}":trip.Status;TripIdText.Text=trip.Id is null?"Der Client startet automatisch eine Fahrt, sobald das Spiel einen Auftrag meldet.":$"Fahrt-ID {trip.Id} · Start {trip.StartedAt.ToLocalTime():dd.MM.yyyy HH:mm:ss}";}
    void TripStart_Click(object sender,RoutedEventArgs e)=>StartTrip();void TripPause_Click(object sender,RoutedEventArgs e)=>PauseTrip();void TripResume_Click(object sender,RoutedEventArgs e)=>ResumeTrip();void TripComplete_Click(object sender,RoutedEventArgs e)=>CompleteTrip();void TripAbort_Click(object sender,RoutedEventArgs e)=>AbortTrip();
    void SaveSettings_Click(object sender,RoutedEventArgs e){if(!Uri.TryCreate(ApiUrlBox.Text.Trim(),UriKind.Absolute,out var server)||server.Scheme!="https"){MessageBox.Show("Bitte verwende eine sichere HTTPS-Serveradresse.","VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Warning);return;}if(VtcCombo.Items.Count>0&&!ApiKeyBox.Password.StartsWith("vth_live_",StringComparison.Ordinal)){MessageBox.Show("Bitte trage den API-Schlüssel der ausgewählten Spedition ein. Er beginnt mit vth_live_.","VTC Truck Hub",MessageBoxButton.OK,MessageBoxImage.Warning);return;}settings.ApiUrl=server.GetLeftPart(UriPartial.Authority);settings.ApiKey=ApiKeyBox.Password;settings.SendIntervalMs=int.TryParse(IntervalBox.Text,out var ms)?Math.Clamp(ms,250,10000):1000;settings.AutoStart=AutoStartCheck.IsChecked==true;settings.MinimizeToTray=MinimizeTrayCheck.IsChecked==true;settings.AutoSync=AutoSyncCheck.IsChecked==true;settings.AutoTrip=AutoTripCheck.IsChecked==true;Save(SettingsPath,settings);using var key=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run",true);if(settings.AutoStart)key?.SetValue("VTCTruckHub",$"\"{Environment.ProcessPath}\"");else key?.DeleteValue("VTCTruckHub",false);Log("Einstellungen gespeichert");MessageBox.Show("Einstellungen gespeichert.","VTC Truck Hub");}
    void ShowFromTray(){Show();WindowState=WindowState.Normal;Activate();}void Window_Closing(object? sender,System.ComponentModel.CancelEventArgs e){if(!forceClose&&settings.MinimizeToTray){e.Cancel=true;Hide();tray.ShowBalloonTip(1500,"VTC Truck Hub","Der Client läuft im Infobereich weiter.",Forms.ToolTipIcon.Info);return;}shutdown.Cancel();udp?.Dispose();tray.Visible=false;tray.Dispose();}
}

public sealed class ClientSettings{public string ApiUrl{get;set;}="https://vtc-truck-hub.de";public string ApiKey{get;set;}="";public string UserId{get;set;}="";public string DriverName{get;set;}="Fahrer";public string AccountEmail{get;set;}="";public string ActiveVtcId{get;set;}="";public Dictionary<string,string> VtcKeys{get;set;}=new();public List<VtcChoice> Memberships{get;set;}=new();public int SendIntervalMs{get;set;}=1000;public bool AutoStart{get;set;}public bool MinimizeToTray{get;set;}=true;public bool AutoSync{get;set;}=true;public bool AutoTrip{get;set;}=true;}
public sealed record VtcChoice(string Id,string Name,string Tag,string RoleName){public override string ToString()=>$"{Name} ({Tag})";}
public sealed class TripState{public string? Id{get;set;}public string? JobKey{get;set;}public bool Active{get;set;}public string Status{get;set;}="Keine aktive Fahrt";public DateTime StartedAt{get;set;}}
public sealed record SendResult(bool Ok,string? TripId=null,string? Lifecycle=null,int PointsTotal=0);
public sealed class TelemetryPacket{public string Game{get;set;}="ETS2";public string? Event{get;set;}public string? JobKey{get;set;}public double WorldX{get;set;}public double WorldY{get;set;}public double WorldZ{get;set;}public double Heading{get;set;}public double SpeedKph{get;set;}public double Rpm{get;set;}public int Gear{get;set;}public double Fuel{get;set;}public double FuelAverage{get;set;}public double FuelRange{get;set;}public bool CruiseControl{get;set;}public bool EngineEnabled{get;set;}public bool ParkingBrake{get;set;}public bool MotorBrake{get;set;}public int RetarderLevel{get;set;}public bool LeftBlinker{get;set;}public bool RightBlinker{get;set;}public bool HazardWarning{get;set;}public bool LowBeam{get;set;}public bool HighBeam{get;set;}public bool Beacon{get;set;}public double BrakeAirPressure{get;set;}public double WaterTemperature{get;set;}public double BatteryVoltage{get;set;}public double SteeringInput{get;set;}public double ThrottleInput{get;set;}public double BrakeInput{get;set;}public double NavigationDistance{get;set;}public double NavigationTime{get;set;}public double NavigationSpeedLimitKph{get;set;}public double TruckDamage{get;set;}public double TrailerDamage{get;set;}public double CargoDamage{get;set;}public int GameTime{get;set;}public double Odometer{get;set;}public string? Truck{get;set;}public string? Cargo{get;set;}public double CargoMass{get;set;}public string? SourceCity{get;set;}public string? SourceCompany{get;set;}public string? DestinationCity{get;set;}public string? DestinationCompany{get;set;}public double PlannedDistanceKm{get;set;}public int GameIncomeCents{get;set;}public string? Server{get;set;}}

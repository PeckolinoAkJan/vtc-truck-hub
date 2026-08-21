#define MyAppName "VTC Truck Hub Desktop-Client"
#define MyAppVersion "1.3.1"
#define MyAppPublisher "VTC Truck Hub"
#define MyAppExeName "VTCTruckHub.Client.exe"
[Setup]
AppId={{7DBBFE15-845D-45F2-A32A-E3867F588517}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\VTC Truck Hub
DefaultGroupName=VTC Truck Hub
OutputDir=output
OutputBaseFilename=VTC-Truck-Hub-Desktop-Client-Setup-v{#MyAppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
CloseApplications=yes
RestartApplications=yes
UninstallDisplayName={#MyAppName}
WizardStyle=modern
[Files]
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{group}\VTC Truck Hub"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\VTC Truck Hub"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
[Tasks]
Name: "desktopicon"; Description: "Desktop-Verknüpfung erstellen"; GroupDescription: "Zusätzliche Verknüpfungen:"; Flags: unchecked
[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "VTC Truck Hub starten"; Flags: nowait postinstall skipifsilent

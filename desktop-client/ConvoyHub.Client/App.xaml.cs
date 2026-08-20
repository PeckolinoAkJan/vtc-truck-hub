using System.IO;
using System.Windows;

namespace ConvoyHub.Client;

public partial class App : System.Windows.Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        try
        {
            var window = new MainWindow();
            MainWindow = window;
            window.Show();
        }
        catch (Exception ex)
        {
            var directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ConvoyHub");
            Directory.CreateDirectory(directory);
            var logPath = Path.Combine(directory, "startup-error.log");
            File.WriteAllText(logPath, ex.ToString());
            System.Windows.MessageBox.Show(
                $"Der ConvoyHub Client konnte nicht gestartet werden.\n\n{ex.Message}\n\nProtokoll: {logPath}",
                "ConvoyHub – Startfehler",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown(1);
        }
    }
}

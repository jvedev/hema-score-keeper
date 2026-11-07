using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Security.Cryptography;

const int defaultPort = 3001;
var installRoot = AppContext.BaseDirectory;
var serverRoot = Path.Combine(installRoot, "server");
var nodePath = Path.Combine(installRoot, "runtime", "node.exe");
var serverEntry = Path.Combine(serverRoot, "apps", "backend", "dist", "server.js");
var configuredDataRoot = Environment.GetEnvironmentVariable("HEMASCORE_DATA_DIR")?.Trim();
var dataRoot = string.IsNullOrEmpty(configuredDataRoot)
    ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HemaScoreKeeper")
    : Path.GetFullPath(configuredDataRoot);
var envPath = Path.Combine(dataRoot, "server.env");
var logPath = Path.Combine(dataRoot, "server.log");

if (!File.Exists(nodePath) || !File.Exists(serverEntry))
{
    Console.Error.WriteLine("The local server package is incomplete. Reinstall or extract the full HEMA Score Keeper package.");
    return 2;
}

Directory.CreateDirectory(dataRoot);
EnsureAuthSecret(envPath);
var portText = Environment.GetEnvironmentVariable("HEMASCORE_PORT");
if (!int.TryParse(portText, out var port)) port = defaultPort;
if (port is < 1 or > 65535)
{
    Console.Error.WriteLine("HEMASCORE_PORT must be between 1 and 65535.");
    return 2;
}

using var log = new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.Read))
{
    AutoFlush = true,
};
using var child = new Process
{
    StartInfo = new ProcessStartInfo
    {
        FileName = nodePath,
        WorkingDirectory = serverRoot,
        UseShellExecute = false,
        RedirectStandardInput = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
    },
};
child.StartInfo.ArgumentList.Add($"--env-file={envPath}");
child.StartInfo.ArgumentList.Add(serverEntry);
child.StartInfo.Environment["APP_DATA_DIR"] = dataRoot;
child.StartInfo.Environment["DATABASE_URL"] = "file:./dev.db";
child.StartInfo.Environment["LIVE_DATA_DIR"] = Path.Combine(dataRoot, "live");
child.StartInfo.Environment["HOST"] = "0.0.0.0";
child.StartInfo.Environment["PORT"] = port.ToString();
child.StartInfo.Environment["NODE_ENV"] = "production";
child.StartInfo.Environment["HEMASCORE_SHUTDOWN_ON_STDIN"] = "1";

child.OutputDataReceived += (_, eventArgs) => WriteLog(log, "out", eventArgs.Data);
child.ErrorDataReceived += (_, eventArgs) => WriteLog(log, "err", eventArgs.Data);
var childStarted = false;

try
{
    if (!child.Start())
    {
        Console.Error.WriteLine("Could not start the HEMA backend.");
        return 1;
    }
    childStarted = true;

    child.BeginOutputReadLine();
    child.BeginErrorReadLine();
    Console.WriteLine("Starting HEMA Score Keeper...");
    Console.WriteLine($"Logs: {logPath}");
    using var inputCancellation = new CancellationTokenSource();
    Task? inputTask = null;
    if (Console.IsInputRedirected)
    {
        inputTask = Task.Run(async () =>
        {
            var command = await Console.In.ReadLineAsync(inputCancellation.Token);
            if (command is null || command.Trim().Equals("stop", StringComparison.OrdinalIgnoreCase))
            {
                RequestShutdown(child);
            }
        });
    }

    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
    var healthUrl = $"http://127.0.0.1:{port}/health";
    var ready = false;
    var deadline = DateTime.UtcNow.AddSeconds(30);
    while (DateTime.UtcNow < deadline && !child.HasExited)
    {
        try
        {
            using var response = await client.GetAsync(healthUrl);
            if (response.IsSuccessStatusCode)
            {
                ready = true;
                break;
            }
        }
        catch (HttpRequestException)
        {
        }
        catch (TaskCanceledException)
        {
        }
        await Task.Delay(300);
    }

    if (!ready)
    {
        Console.Error.WriteLine(child.HasExited
            ? $"The backend exited with code {child.ExitCode}. See {logPath}"
            : $"The backend did not become ready in 30 seconds. See {logPath}");
        child.StandardInput.Close();
        return 1;
    }

    Console.WriteLine("Server is ready. Open one of these addresses on this PC or a phone on the same Wi-Fi:");
    foreach (var address in LanAddresses())
    {
        Console.WriteLine($"  http://{address}:{port}/");
    }
    Console.WriteLine($"Allow inbound TCP {port} on the Windows Private network profile if phones cannot connect.");
    Console.WriteLine("Do not configure public router port forwarding. Press Ctrl+C to stop the server.");

    try
    {
        if (Environment.GetEnvironmentVariable("HEMASCORE_NO_BROWSER") != "1")
        {
            Process.Start(new ProcessStartInfo($"http://127.0.0.1:{port}/") { UseShellExecute = true });
        }
    }
    catch (Exception error)
    {
        Console.Error.WriteLine($"Could not open a browser automatically: {error.Message}");
    }

    ConsoleCancelEventHandler cancelHandler = (_, eventArgs) =>
    {
        eventArgs.Cancel = true;
        RequestShutdown(child);
    };
    Console.CancelKeyPress += cancelHandler;
    try
    {
        await child.WaitForExitAsync();
    }
    finally
    {
        inputCancellation.Cancel();
        if (inputTask is not null)
        {
            try
            {
                await inputTask;
            }
            catch (OperationCanceledException) when (inputCancellation.IsCancellationRequested)
            {
            }
        }
        Console.CancelKeyPress -= cancelHandler;
    }
    Console.WriteLine($"Server stopped with exit code {child.ExitCode}.");
    return child.ExitCode;
}
catch (Exception error)
{
    Console.Error.WriteLine($"Could not run the HEMA backend: {error.Message}");
    if (childStarted && !child.HasExited)
    {
        try
        {
            child.StandardInput.Close();
        }
        catch (Exception closeError) when (closeError is InvalidOperationException or IOException)
        {
        }
    }
    return 1;
}

static void EnsureAuthSecret(string envPath)
{
    var lines = File.Exists(envPath) ? File.ReadAllLines(envPath).ToList() : [];
    var secretLine = lines.FindIndex((line) => line.TrimStart().StartsWith("AUTH_SECRET=", StringComparison.Ordinal));
    if (secretLine >= 0 && !string.IsNullOrWhiteSpace(lines[secretLine].Split('=', 2)[1])) return;

    var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');
    var entry = $"AUTH_SECRET={secret}";
    if (secretLine >= 0) lines[secretLine] = entry;
    else lines.Add(entry);
    File.WriteAllLines(envPath, lines);
    File.SetAttributes(envPath, File.GetAttributes(envPath) | FileAttributes.Hidden);
}

static void WriteLog(StreamWriter log, string source, string? line)
{
    if (line is null) return;
    lock (log)
    {
        log.WriteLine($"[{DateTimeOffset.Now:O}] [{source}] {line}");
        Console.WriteLine(line);
    }
}

static void RequestShutdown(Process process)
{
    try
    {
        process.StandardInput.Close();
    }
    catch (Exception error) when (error is InvalidOperationException or IOException)
    {
    }
}

static IEnumerable<IPAddress> LanAddresses() =>
    NetworkInterface.GetAllNetworkInterfaces()
        .Where(adapter => adapter.OperationalStatus == OperationalStatus.Up)
        .SelectMany(adapter => adapter.GetIPProperties().UnicastAddresses)
        .Select(address => address.Address)
        .Where(address => address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork
            && !IPAddress.IsLoopback(address)
            && !address.ToString().StartsWith("169.254.", StringComparison.Ordinal))
        .Distinct()
        .ToArray();

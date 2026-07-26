// Loads one VST3 plugin, shows its editor in a native window, and takes
// line commands over stdin so it can be driven as a child process by
// SampleBuddy's main process (src/main/audio/instrumentHost.ts):
//   midi <note> <velocity> <on|off>   deliver a note to the plugin
//   capture start <path>              start writing plugin output to a WAV
//   capture stop                      stop; prints "CAPTURE_DONE <path>"
//   panic                             all-notes-off
//   quit                              shut down cleanly
// Also supports --list-devices (print ASIO device names as JSON lines, then
// exit, no plugin load) for populating a device picker.
#include <JuceHeader.h>
#include <atomic>
#include <iostream>
#include <sstream>
#include <thread>

using namespace juce;

//==============================================================================
/** AudioProcessorPlayer already does the real work a naive callback would
 *  get wrong: reconciling the plugin's actual bus/channel layout against the
 *  device's via setPlayConfigDetails() before prepareToPlay(). An earlier
 *  version of this file reimplemented the IO callback from scratch instead
 *  of subclassing this, and skipped that reconciliation — Kontakt's
 *  processBlock() then wrote outside the (wrongly-sized) buffer and crashed
 *  the process on the very first note, reproducing reliably with ASIO4ALL.
 *  Subclassing instead means the base class does the correct processing,
 *  and this only adds a tap on its already-correct output for capture. */
class HostAudioCallback : public AudioProcessorPlayer
{
public:
    HostAudioCallback() { backgroundThread.startThread(Thread::Priority::high); }
    ~HostAudioCallback() override { backgroundThread.stopThread(2000); }

    void allNotesOff()
    {
        for (int channel = 1; channel <= 16; ++channel)
            handleIncomingMidiMessage(nullptr, MidiMessage::allNotesOff(channel));
    }

    bool startCapture(const File& file, double captureSampleRate, int numChannels, String& errorOut)
    {
        stopCapture();

        file.getParentDirectory().createDirectory();
        file.deleteFile();

        std::unique_ptr<OutputStream> stream(file.createOutputStream());
        if (stream == nullptr)
        {
            errorOut = "could not open output file";
            return false;
        }

        WavAudioFormat wavFormat;
        auto options = AudioFormatWriterOptions{}
                           .withSampleRate(captureSampleRate)
                           .withNumChannels(numChannels)
                           .withBitsPerSample(24);
        auto writer = wavFormat.createWriterFor(stream, options);
        if (writer == nullptr)
        {
            errorOut = "could not create WAV writer";
            return false;
        }

        const ScopedLock sl(writerLock);
        activeWriter = std::make_unique<AudioFormatWriter::ThreadedWriter>(writer.release(), backgroundThread, 32768);
        return true;
    }

    void stopCapture()
    {
        const ScopedLock sl(writerLock);
        activeWriter = nullptr; // flushes remaining buffered samples on destruction
    }

    void audioDeviceIOCallbackWithContext(const float* const* inputChannelData, int numInputChannels,
                                           float* const* outputChannelData, int numOutputChannels, int numSamples,
                                           const AudioIODeviceCallbackContext& context) override
    {
        AudioProcessorPlayer::audioDeviceIOCallbackWithContext(
            inputChannelData, numInputChannels, outputChannelData, numOutputChannels, numSamples, context);

        const ScopedLock sl(writerLock);
        if (activeWriter != nullptr)
        {
            std::vector<const float*> readPointers((size_t) numOutputChannels);
            for (int i = 0; i < numOutputChannels; ++i)
                readPointers[(size_t) i] = outputChannelData[i];
            activeWriter->write(readPointers.data(), numSamples);
        }
    }

private:
    CriticalSection writerLock;
    TimeSliceThread backgroundThread { "vst-host-capture-writer" };
    std::unique_ptr<AudioFormatWriter::ThreadedWriter> activeWriter;
};

//==============================================================================
class VstHostWindow : public DocumentWindow
{
public:
    VstHostWindow(const String& name, AudioProcessorEditor* editor)
        : DocumentWindow(name, Colours::darkgrey, DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar(true);
        setContentOwned(editor, true);
        setResizable(true, false);
        centreWithSize(getWidth(), getHeight());
        setVisible(true);
    }

    void closeButtonPressed() override { JUCEApplication::getInstance()->systemRequestedQuit(); }
};

//==============================================================================
class VstHostApplication : public JUCEApplication
{
public:
    const String getApplicationName() override { return "SampleBuddy VST Host"; }
    const String getApplicationVersion() override { return "0.1.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }

    void initialise(const String& commandLineParameters) override
    {
        auto args = StringArray::fromTokens(commandLineParameters, true);

        if (args.contains("--list-devices"))
        {
            listDevicesAndExit();
            return;
        }

        String pluginPath, deviceName;
        for (int i = 0; i < args.size(); ++i)
        {
            if (args[i] == "--plugin" && i + 1 < args.size())
                pluginPath = args[i + 1].unquoted();
            if (args[i] == "--device" && i + 1 < args.size())
                deviceName = args[i + 1].unquoted();
        }
        requestedDeviceName = deviceName;

        if (pluginPath.isEmpty())
        {
            std::cerr << "Usage: VstHost --plugin <path-to-vst3> [--device <asio-device-name>]" << std::endl;
            quit();
            return;
        }

        addDefaultFormatsToManager(formatManager);

        VST3PluginFormat vst3Format;
        OwnedArray<PluginDescription> found;
        vst3Format.findAllTypesForFile(found, pluginPath);

        if (found.isEmpty())
        {
            std::cerr << "ERROR no plugin found at: " << pluginPath << std::endl;
            quit();
            return;
        }

        formatManager.createPluginInstanceAsync(
            *found[0], 44100.0, 512,
            [this](std::unique_ptr<AudioPluginInstance> instance, const String& error) {
                pluginLoaded(std::move(instance), error);
            });
    }

    void shutdown() override
    {
        stdinThreadShouldStop = true;
        if (stdinThread.joinable())
            stdinThread.detach(); // std::cin read can't be interrupted cleanly; the process is exiting anyway

        audioCallback.stopCapture();
        mainWindow = nullptr;
        deviceManager.removeAudioCallback(&audioCallback);
        audioCallback.setProcessor(nullptr);
        plugin = nullptr;
    }

    void systemRequestedQuit() override { quit(); }

private:
    void listDevicesAndExit()
    {
        AudioDeviceManager manager;
        for (auto* type : manager.getAvailableDeviceTypes())
        {
            if (type->getTypeName() != "ASIO")
                continue;

            type->scanForDevices();
            for (auto& name : type->getDeviceNames())
                std::cout << "{\"name\": " << JSON::toString(var(name)) << "}" << std::endl;
        }
        quit();
    }

    void pluginLoaded(std::unique_ptr<AudioPluginInstance> instance, const String& error)
    {
        if (instance == nullptr)
        {
            std::cerr << "ERROR failed to load plugin: " << error << std::endl;
            quit();
            return;
        }

        plugin = std::move(instance);
        audioCallback.setProcessor(plugin.get());

        // Create the editor before any audio device is open — Kontakt (and
        // plugins generally) can't be assumed safe for processBlock() to run
        // concurrently with editor/UI initialisation on the message thread.
        // Opening ASIO4ALL before this reordering crashed reliably; WASAPI's
        // slower device-open path had been masking the same race.
        if (plugin->hasEditor())
        {
            if (auto* editor = plugin->createEditorAndMakeActive())
                mainWindow = std::make_unique<VstHostWindow>(plugin->getName(), editor);
        }
        else
        {
            std::cout << "Plugin has no editor." << std::endl;
        }

        deviceManager.getAvailableDeviceTypes(); // populates types lazily, needed before setCurrentAudioDeviceType
        deviceManager.setCurrentAudioDeviceType("ASIO", true);

        AudioDeviceManager::AudioDeviceSetup setup;
        deviceManager.getAudioDeviceSetup(setup);
        setup.outputDeviceName = requestedDeviceName.isNotEmpty() ? requestedDeviceName : setup.outputDeviceName;
        setup.useDefaultOutputChannels = true;
        setup.useDefaultInputChannels = false;
        setup.inputDeviceName = {};
        String setupError = deviceManager.setAudioDeviceSetup(setup, true);

        if (setupError.isNotEmpty() || deviceManager.getCurrentAudioDevice() == nullptr)
        {
            std::cerr << "ERROR could not open ASIO device"
                       << (requestedDeviceName.isNotEmpty() ? " '" + requestedDeviceName + "'" : String())
                       << (setupError.isNotEmpty() ? (": " + setupError) : String()) << std::endl;
            quit();
            return;
        }

        deviceManager.addAudioCallback(&audioCallback);

        auto* device = deviceManager.getCurrentAudioDevice();
        std::cout << "Audio device: " << device->getName() << " (output channels: "
                   << device->getActiveOutputChannels().countNumberOfSetBits()
                   << ", sample rate: " << device->getCurrentSampleRate() << ")" << std::endl;

        std::cout << "READY" << std::endl;
        std::cout.flush();

        stdinThread = std::thread([this] { runStdinLoop(); });
    }

    void runStdinLoop()
    {
        std::string line;
        while (!stdinThreadShouldStop && std::getline(std::cin, line))
            handleCommand(line);
    }

    void handleCommand(const std::string& line)
    {
        std::istringstream iss(line);
        std::string cmd;
        iss >> cmd;

        if (cmd == "quit")
        {
            MessageManager::callAsync([] { JUCEApplication::getInstance()->systemRequestedQuit(); });
        }
        else if (cmd == "panic")
        {
            audioCallback.allNotesOff();
            std::cout << "OK panic" << std::endl;
        }
        else if (cmd == "midi")
        {
            int note = 0, velocity = 0;
            std::string state;
            iss >> note >> velocity >> state;

            auto message = state == "on" ? MidiMessage::noteOn(1, note, (uint8) velocity)
                                          : MidiMessage::noteOff(1, note);
            audioCallback.handleIncomingMidiMessage(nullptr, message);
            std::cout << "OK midi " << note << " " << state << std::endl;
        }
        else if (cmd == "capture")
        {
            std::string sub;
            iss >> sub;

            if (sub == "start")
            {
                std::string rest;
                std::getline(iss, rest);
                String path = String(rest).trim().unquoted();
                startCaptureCommand(path);
            }
            else if (sub == "stop")
            {
                stopCaptureCommand();
            }
        }
    }

    void startCaptureCommand(const String& path)
    {
        auto* device = deviceManager.getCurrentAudioDevice();
        if (device == nullptr)
        {
            std::cout << "ERROR capture start: no audio device" << std::endl;
            return;
        }

        String error;
        if (!audioCallback.startCapture(File(path), device->getCurrentSampleRate(),
                                         device->getActiveOutputChannels().countNumberOfSetBits(), error))
        {
            std::cout << "ERROR capture start: " << error << std::endl;
            return;
        }

        capturePath = path;
        std::cout << "OK capture start" << std::endl;
    }

    void stopCaptureCommand()
    {
        audioCallback.stopCapture();
        std::cout << "CAPTURE_DONE " << capturePath << std::endl;
        capturePath = {};
    }

    AudioPluginFormatManager formatManager;
    AudioDeviceManager deviceManager;
    HostAudioCallback audioCallback;
    std::unique_ptr<AudioPluginInstance> plugin;
    std::unique_ptr<VstHostWindow> mainWindow;
    String requestedDeviceName;
    String capturePath;

    std::thread stdinThread;
    std::atomic<bool> stdinThreadShouldStop { false };
};

START_JUCE_APPLICATION(VstHostApplication)

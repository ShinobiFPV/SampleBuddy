// Feasibility spike, not shipped code: loads one VST3 plugin, shows its
// editor in a native window, and takes "midi <note> <velocity> <on|off>" /
// "quit" commands over stdin so it can be driven from a spawned child
// process (proving the shape Electron's main process would use later).
#include <JuceHeader.h>
#include <atomic>
#include <iostream>
#include <sstream>
#include <thread>

using namespace juce;

class VstHostSpikeWindow : public DocumentWindow
{
public:
    VstHostSpikeWindow(const String& name, AudioProcessorEditor* editor)
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

class VstHostSpikeApplication : public JUCEApplication
{
public:
    const String getApplicationName() override { return "SampleBuddy VST Host Spike"; }
    const String getApplicationVersion() override { return "0.0.1"; }
    bool moreThanOneInstanceAllowed() override { return true; }

    void initialise(const String& commandLineParameters) override
    {
        auto args = StringArray::fromTokens(commandLineParameters, true);
        String pluginPath;
        for (int i = 0; i < args.size(); ++i)
            if (args[i] == "--plugin" && i + 1 < args.size())
                pluginPath = args[i + 1].unquoted();

        if (pluginPath.isEmpty())
        {
            std::cerr << "Usage: VstHostSpike --plugin <path-to-vst3>" << std::endl;
            quit();
            return;
        }

        addDefaultFormatsToManager(formatManager);

        VST3PluginFormat vst3Format;
        OwnedArray<PluginDescription> found;
        vst3Format.findAllTypesForFile(found, pluginPath);

        if (found.isEmpty())
        {
            std::cerr << "No plugin found at: " << pluginPath << std::endl;
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
            stdinThread.detach(); // std::cin read can't be interrupted cleanly; fine for a spike

        mainWindow = nullptr;
        deviceManager.removeAudioCallback(&player);
        player.setProcessor(nullptr);
        plugin = nullptr;
    }

    void systemRequestedQuit() override { quit(); }

private:
    void pluginLoaded(std::unique_ptr<AudioPluginInstance> instance, const String& error)
    {
        if (instance == nullptr)
        {
            std::cerr << "Failed to load plugin: " << error << std::endl;
            quit();
            return;
        }

        plugin = std::move(instance);

        deviceManager.initialiseWithDefaultDevices(0, 2);
        player.setProcessor(plugin.get());
        deviceManager.addAudioCallback(&player);

        if (auto* device = deviceManager.getCurrentAudioDevice())
        {
            std::cout << "Audio device: " << device->getName() << " (output channels: "
                      << device->getActiveOutputChannels().countNumberOfSetBits() << ", sample rate: "
                      << device->getCurrentSampleRate() << ")" << std::endl;
        }
        else
        {
            std::cout << "No audio device selected!" << std::endl;
        }

        if (plugin->hasEditor())
        {
            if (auto* editor = plugin->createEditorAndMakeActive())
                mainWindow = std::make_unique<VstHostSpikeWindow>(plugin->getName(), editor);
        }
        else
        {
            std::cout << "Plugin has no editor." << std::endl;
        }

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
        else if (cmd == "midi")
        {
            int note = 0, velocity = 0;
            std::string state;
            iss >> note >> velocity >> state;

            auto message = state == "on" ? MidiMessage::noteOn(1, note, (uint8) velocity)
                                          : MidiMessage::noteOff(1, note);
            player.handleIncomingMidiMessage(nullptr, message);
            std::cout << "OK midi " << note << " " << state << std::endl;
        }
    }

    AudioPluginFormatManager formatManager;
    AudioDeviceManager deviceManager;
    AudioProcessorPlayer player;
    std::unique_ptr<AudioPluginInstance> plugin;
    std::unique_ptr<VstHostSpikeWindow> mainWindow;

    std::thread stdinThread;
    std::atomic<bool> stdinThreadShouldStop { false };
};

START_JUCE_APPLICATION(VstHostSpikeApplication)

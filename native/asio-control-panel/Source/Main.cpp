// Loads the named ASIO driver and shows its control-panel dialog — the
// only way to reach a driver's (e.g. ASIO4ALL's) own settings UI, since
// ASIO defines no standalone launcher, only IASIO::controlPanel() called
// by a host that has init()'d the driver. See ../README.md for why this
// is a separate GPLv3 process rather than part of SampleBuddy itself.
//
// usage: "SampleBuddy ASIO Control Panel.exe" <driver name>
#include <cstdio>

#include "asiosys.h"
#include "asio.h"
#include <windows.h>
#include "iasiodrv.h"
#include "asiodrivers.h"

// Declared (not exported via a header) by asio-sdk/asiodrivers.cpp — this
// is the exact idiom Steinberg's own ASIO SDK host samples use: it owns the
// module-global AsioDrivers instance that ASIOExit() cleans up afterwards.
extern bool loadAsioDriver(char* name);

// Buffers are never actually processed (the stream is never start()'d) —
// creating them is only to get the driver into its "prepared" state, which
// ASIO4ALL (and possibly other drivers) requires before controlPanel() will
// show anything. These stubs exist solely to satisfy ASIOCreateBuffers'
// required callback pointers.
static void onBufferSwitch(long, ASIOBool) {}
static void onSampleRateDidChange(ASIOSampleRate) {}
static long onAsioMessage(long, long, void*, double*)
{
    return 0;
}
static ASIOTime* onBufferSwitchTimeInfo(ASIOTime*, long, ASIOBool)
{
    return nullptr;
}

static LRESULT CALLBACK ownerWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    if (msg == WM_DESTROY)
    {
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcA(hwnd, msg, wParam, lParam);
}

int main(int argc, char** argv)
{
    if (argc < 2)
    {
        fprintf(stderr, "usage: \"SampleBuddy ASIO Control Panel.exe\" <driver name>\n");
        return 2;
    }

    // A real, visible top-level window — some drivers' control panels
    // (ASIO4ALL confirmed) are modeless windows that rely on the calling
    // host's own message loop to render and respond, rather than blocking
    // synchronously like a modal dialog would. This window's title tells
    // the user how to close everything down once they're done.
    WNDCLASSA windowClass = {};
    windowClass.lpfnWndProc = ownerWndProc;
    windowClass.hInstance = GetModuleHandle(nullptr);
    windowClass.lpszClassName = "SampleBuddyAsioControlPanelOwner";
    windowClass.hCursor = LoadCursor(nullptr, IDC_ARROW);
    windowClass.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    RegisterClassA(&windowClass);

    HWND owner = CreateWindowExA(0, windowClass.lpszClassName, "SampleBuddy ASIO Settings",
                                  WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_VISIBLE,
                                  CW_USEDEFAULT, CW_USEDEFAULT, 380, 100, nullptr, nullptr, windowClass.hInstance,
                                  nullptr);
    CreateWindowExA(0, "STATIC", "Close this window once you're done with the ASIO settings panel.",
                     WS_CHILD | WS_VISIBLE, 12, 12, 356, 60, owner, nullptr, windowClass.hInstance, nullptr);

    if (!loadAsioDriver(argv[1]))
    {
        fprintf(stderr, "Could not load ASIO driver \"%s\" - is it installed?\n", argv[1]);
        return 1;
    }

    ASIODriverInfo info = {};
    info.asioVersion = 2;
    info.sysRef = owner;
    if (ASIOInit(&info) != ASE_OK)
    {
        fprintf(stderr, "Could not open \"%s\" - %s (is it in use by an active recording?)\n", argv[1],
                info.errorMessage[0] ? info.errorMessage : "unknown error");
        ASIOExit();
        return 1;
    }

    long numInputs = 0, numOutputs = 0;
    ASIOGetChannels(&numInputs, &numOutputs);
    long minSize = 0, maxSize = 0, prefSize = 0, granularity = 0;
    ASIOGetBufferSize(&minSize, &maxSize, &prefSize, &granularity);

    ASIOBufferInfo bufferInfos[2] = {};
    long numBuffers = 0;
    if (numInputs > 0) bufferInfos[numBuffers++] = { ASIOTrue, 0, { nullptr, nullptr } };
    if (numOutputs > 0) bufferInfos[numBuffers++] = { ASIOFalse, 0, { nullptr, nullptr } };

    ASIOCallbacks callbacks = {};
    callbacks.bufferSwitch = &onBufferSwitch;
    callbacks.sampleRateDidChange = &onSampleRateDidChange;
    callbacks.asioMessage = &onAsioMessage;
    callbacks.bufferSwitchTimeInfo = &onBufferSwitchTimeInfo;

    ASIOError createResult = ASIOCreateBuffers(bufferInfos, numBuffers, prefSize, &callbacks);

    ASIOControlPanel();

    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0) > 0)
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    if (createResult == ASE_OK) ASIODisposeBuffers();
    ASIOExit();
    return 0;
}

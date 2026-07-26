cmake_minimum_required(VERSION 3.22)

project(SampleBuddyVstHostSpike VERSION 0.0.1)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(
  JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 8.0.14
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(JUCE)

juce_add_gui_app(VstHostSpike
  PRODUCT_NAME "SampleBuddy VST Host Spike"
  COMPANY_NAME "ShinTech Electronics"
  BUNDLE_ID "com.shintech.samplebuddy.vsthostspike"
)

target_sources(VstHostSpike PRIVATE
  Source/Main.cpp
)

juce_generate_juce_header(VstHostSpike)

target_compile_definitions(VstHostSpike PRIVATE
  JUCE_PLUGINHOST_VST3=1
  JUCE_PLUGINHOST_VST=0
  JUCE_PLUGINHOST_AU=0
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:VstHostSpike,JUCE_PRODUCT_NAME>"
  JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:VstHostSpike,JUCE_VERSION>"
)

target_link_libraries(VstHostSpike PRIVATE
  juce::juce_audio_processors
  juce::juce_audio_devices
  juce::juce_audio_utils
  juce::juce_gui_basics
  juce::juce_gui_extra
  juce::juce_recommended_config_flags
  juce::juce_recommended_lto_flags
  juce::juce_recommended_warning_flags
)

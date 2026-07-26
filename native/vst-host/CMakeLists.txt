cmake_minimum_required(VERSION 3.22)

project(SampleBuddyVstHost VERSION 0.1.0)

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

juce_add_gui_app(VstHost
  PRODUCT_NAME "SampleBuddy VST Host"
  COMPANY_NAME "ShinTech Electronics"
  BUNDLE_ID "com.shintech.samplebuddy.vsthost"
)

target_sources(VstHost PRIVATE
  Source/Main.cpp
)

juce_generate_juce_header(VstHost)

target_compile_definitions(VstHost PRIVATE
  JUCE_PLUGINHOST_VST3=1
  JUCE_PLUGINHOST_VST=0
  JUCE_PLUGINHOST_AU=0
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_ASIO=1
  JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:VstHost,JUCE_PRODUCT_NAME>"
  JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:VstHost,JUCE_VERSION>"
)

target_link_libraries(VstHost PRIVATE
  juce::juce_audio_processors
  juce::juce_audio_devices
  juce::juce_audio_utils
  juce::juce_gui_basics
  juce::juce_gui_extra
  juce::juce_recommended_config_flags
  juce::juce_recommended_lto_flags
  juce::juce_recommended_warning_flags
)

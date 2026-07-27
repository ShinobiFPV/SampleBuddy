cmake_minimum_required(VERSION 3.22)

project(SampleBuddyAsioControlPanel VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(AsioControlPanel
  Source/Main.cpp
  Source/asio-sdk/asio.cpp
  Source/asio-sdk/asiolist.cpp
  Source/asio-sdk/asiodrivers.cpp
)

set_target_properties(AsioControlPanel PROPERTIES
  OUTPUT_NAME "SampleBuddy ASIO Control Panel"
)

target_include_directories(AsioControlPanel PRIVATE Source/asio-sdk)

# COM (CoCreateInstance et al, used by the vendored ASIO SDK loader) and the
# GUI subsystem's window/message APIs (used to give the control-panel dialog
# a real owner window).
target_link_libraries(AsioControlPanel PRIVATE ole32 user32)

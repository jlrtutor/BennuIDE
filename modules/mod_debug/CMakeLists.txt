cmake_minimum_required(VERSION 3.16)
project(mod_debug C)

set(CMAKE_C_STANDARD 99)

include_directories(include)

add_library(mod_debug SHARED
    src/mod_debug_socket.c
)

if (WIN32)
    target_link_libraries(mod_debug ws2_32)
endif()

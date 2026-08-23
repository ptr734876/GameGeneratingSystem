cmake_minimum_required(VERSION 3.20)
project(GameGeneratingSystemCore VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(game_core SHARED
    src/core/TelemetryTracker.cpp
    src/core/PowerBudget.cpp
)
target_include_directories(game_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_compile_features(game_core PUBLIC cxx_std_20)
if (MSVC)
    target_compile_options(game_core PRIVATE /W4 /permissive-)
else()
    target_compile_options(game_core PRIVATE -Wall -Wextra -Wpedantic -Wconversion)
endif()

add_library(skillgen_c_api SHARED src/c_api/SkillGen_C_API.cpp)
target_include_directories(skillgen_c_api PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(skillgen_c_api PRIVATE game_core)
target_compile_definitions(skillgen_c_api PRIVATE SKILLGEN_BUILD_SHARED SKILLGEN_BUILDING_LIBRARY)
target_compile_features(skillgen_c_api PUBLIC cxx_std_20)

include(CTest)
if (BUILD_TESTING)
    find_package(GTest CONFIG QUIET)
    if (NOT GTest_FOUND)
        include(FetchContent)
        FetchContent_Declare(googletest
            URL https://github.com/google/googletest/archive/refs/tags/v1.14.0.zip
            DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
        set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
        FetchContent_MakeAvailable(googletest)
    endif()
    add_executable(core_tests tests/test_core.cpp)
    target_link_libraries(core_tests PRIVATE game_core GTest::gtest_main)
    add_executable(c_api_tests tests/test_c_api.cpp)
    target_link_libraries(c_api_tests PRIVATE skillgen_c_api GTest::gtest_main)
    include(GoogleTest)
    gtest_discover_tests(core_tests)
    gtest_discover_tests(c_api_tests)
endif()

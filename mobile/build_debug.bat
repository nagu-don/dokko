@echo off
set JAVA_HOME=E:\Development\jdk17
set ANDROID_HOME=E:\Development\Android\Sdk
set ANDROID_SDK_ROOT=E:\Development\Android\Sdk
set GRADLE_USER_HOME=E:\Development\Gradle
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%
cd /d C:\Users\dell\Desktop\dokko\mobile\android
gradlew.bat app:assembleDebug -x lint -x test --no-daemon --build-cache -PreactNativeArchitectures=arm64-v8a

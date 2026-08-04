# ADB APK Installer Pro - MAJOR UPDATE

## Overview
ADB APK Installer Pro is a premier desktop application designed for Windows. It empowers you to effortlessly manage, download, and install Android applications directly to your connected devices. By bridging your computer with online APK sources, the software facilitates rapid app installation through a robust ADB integration.

## What's New in Version 2.0
I am thrilled to announce a substantial leap forward in Android device management. Version 2.0 introduces a suite of powerful capabilities engineered to streamline your workflow and provide unprecedented control.

* Integrated Screen Mirroring: Seamlessly view and control your device screen directly from your desktop using the newly integrated scrcpy engine.
* Advanced Wireless Connectivity: Say goodbye to cables with the new Wireless Pairing Wizard for Android 11 and above. Your devices will now persistently auto-reconnect for a frictionless experience.
* Pre-Install Permission Analyzer: Maintain absolute security by thoroughly reviewing requested APK permissions before initiating any installation.
* Drag and Drop Bulk Installation: Drastically reduce setup time by dragging and dropping multiple APK files for simultaneous batch installation.
* Pro Developer Tools: Dive deep into device diagnostics with a live Logcat console and real-time performance monitoring.
* Instant Media Capture: Capture high-quality screenshots and record screen activity instantly with dedicated tools.
* Uncompromised Stability: Enjoy a flawless experience with comprehensive fixes addressing stuck offline devices and download routing inaccuracies.

## Why Choose This Platform?
The primary objective of this application is to completely eliminate the friction of Android app management. Rather than executing tedious manual operations, you can now track sources, process background downloads, and deploy advanced ADB commands from a single, elegantly designed dashboard. This translates to massive time savings for device configuration and testing environments.

## Core Features
* Automatic Device Detection: Instantly recognizes connected Android devices and active emulators upon launch.
* Intelligent Downloads: Queue, monitor, and resume multiple parallel APK downloads with complete reliability.
* Source Management: Curate a personal library by adding your preferred online APK repositories and links.
* Isolated Safe Browsing: All external links are processed in an isolated environment to ensure maximum system security.
* Elegant Interface: A meticulously crafted dashboard that prioritizes speed, clarity, and visual excellence.

## Getting Started

### Quick Install (Recommended)
The easiest way to get started is to download the pre-compiled Windows executable.
1. Visit the [Releases Page](https://github.com/Praashon/adb-install-script/releases)
2. Download the latest `ADB APK Installer Pro-Setup.exe` file.
3. Run the installer and follow the on-screen prompts.

### Build From Source
If you prefer to compile the application yourself, follow these instructions.

#### Prerequisites
1. Node.js (Version 20.0.0 or higher recommended)
2. Git version control
3. An Android device with USB Debugging enabled (or an active emulator)
4. ADB installed and configured in your system PATH

### Installation Guide
Launch your preferred terminal and execute the following sequence:

1. Clone the repository:
   ```bash
   git clone https://github.com/Praashon/adb-install-script.git
   ```

2. Navigate to the project directory:
   ```bash
   cd adb-install-script
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Launch the development environment:
   ```bash
   npm run dev
   ```

5. (Optional) Compile for production use:
   ```bash
   npm run build
   npm run package
   ```

   
## Usage Instructions

1. Connect Your Device: Interface your Android device with your computer via USB or wireless debugging. Ensure USB Debugging is authorized. The dashboard will instantly register and display your device.
2. Configure Sources: Navigate to the Sources module to input your trusted APK repository links.
3. Initiate Downloads: Browse your configured sources and select an APK. The integrated download engine will seamlessly process the file transfer.
4. Deploy via ADB: Upon download completion, engage the install action adjacent to the file. The application will autonomously push and install the APK to your selected device.

## Technology Stack
* Electron
* React
* TypeScript
* Vite
* Tailwind CSS

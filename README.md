# ADB APK Installer Pro

## Overview
ADB APK Installer Pro is an intelligent desktop application designed to streamline the process of managing, downloading, and installing Android packages directly to your connected devices. Built with modern web technologies and wrapped in a secure Electron environment, it provides a seamless bridge between web-based APK sources and local hardware.

## Key Purpose
The core mission of this platform is to remove the friction from side-loading Android applications. By integrating source tracking, background downloading, and automated ADB commands into a single cohesive interface, developers and enthusiasts can significantly speed up their testing and deployment workflows.

## Features
* Automated ADB Device Detection: Instantly connect to and monitor available Android devices or emulators.
* Integrated Download Manager: Queue, track, and resume multiple APK downloads simultaneously.
* Source Management Engine: Easily plug into various APK repositories and maintain a personalized library.
* Secure Sandboxed Environment: Ensure all external web interactions remain isolated and safe.
* Modern Desktop Interface: Navigate a vibrant, intuitive dashboard built for speed and clarity.

## Installation

### Prerequisites
1. Node.js (Version 20.0.0 or higher recommended)
2. Git
3. An Android device with USB Debugging enabled (or an active emulator)
4. ADB installed and added to your system PATH

### Setup Guide
Open your terminal and execute the following commands:

1. Clone the repository:
   ```bash
   git clone https://github.com/Praashon/adb-install-script.git
   ```

2. Navigate into the project directory:
   ```bash
   cd adb-install-script
   ```

3. Install the required project dependencies:
   ```bash
   npm install
   ```

4. Launch the application in development mode:
   ```bash
   npm run dev
   ```

5. (Optional) Build and package the application for production:
   ```bash
   npm run build
   npm run package
   ```

## Usage Instructions

1. Connect Your Device: Plug your Android device into your computer and ensure USB Debugging is authorized. The application will automatically detect and display your device in the dashboard.
2. Add a Source: Navigate to the Sources section to configure your preferred APK repositories or direct links. 
3. Download an Application: Browse your configured sources and select an APK to download. The integrated download engine will handle the file transfer and verification.
4. Install via ADB: Once the download is complete, click the install button next to the package. The application will push the APK and install it to your selected device automatically.

## Technologies Used
* Electron
* React
* TypeScript
* Vite
* Tailwind CSS

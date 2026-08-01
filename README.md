# ADB APK Installer Pro

## Overview
ADB APK Installer Pro is a simple desktop app for Windows. It helps you manage, download, and install Android apps to your connected devices. It connects your computer to online APK sources and lets you install apps quickly using ADB.

## Why Use This App?
The main goal of this app is to make installing Android apps easy. Instead of doing things by hand, you can track sources, download files in the background, and use ADB commands all from one clean dashboard. This saves a lot of time for testing and setting up devices.

## Features
* Auto Detect Devices: The app finds your connected Android devices or emulators right away.
* Easy Downloads: You can queue, track, and resume multiple APK downloads at the same time.
* Manage Sources: Add your favorite online APK links or repositories to keep a personal library.
* Safe Browsing: All online links are kept separate so your computer stays safe.
* Clean Design: The dashboard is built to be fast, clear, and very easy to look at.

## Installation

### What You Need First
1. Node.js (Version 20.0.0 or higher is best)
2. Git
3. An Android device with USB Debugging turned on (or an active emulator)
4. ADB installed and added to your system PATH

### Setup Steps
Open your terminal and run these commands:

1. Clone the project:
   ```bash
   git clone https://github.com/Praashon/adb-install-script.git
   ```

2. Open the project folder:
   ```bash
   cd adb-install-script
   ```

3. Install the required files:
   ```bash
   npm install
   ```

4. Start the app in development mode:
   ```bash
   npm run dev
   ```

5. (Optional) Build the app for normal use:
   ```bash
   npm run build
   npm run package
   ```

## How to Use It

1. Connect Your Device: Plug your Android device into your computer. Make sure USB Debugging is allowed. The app will find your device and show it on the dashboard.
2. Add a Source: Go to the Sources section. Here you can add your favorite APK links.
3. Download an App: Look through your sources and pick an APK to download. The app will handle the file transfer for you.
4. Install with ADB: When the download is done, click the install button next to the file. The app will push the APK to your device and install it automatically.

## Built With
* Electron
* React
* TypeScript
* Vite
* Tailwind CSS

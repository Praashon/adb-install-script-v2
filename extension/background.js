const NATIVE_HOST_NAME = "com.adb_installer_pro.app";
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "install-apk-link",
    title: "Install APK via ADB",
    contexts: ["link", "page"],
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "install-apk-link") {
    const targetUrl = info.linkUrl || info.pageUrl;
    if (targetUrl) {
      sendToDesktopApp(targetUrl);
    }
  }
});
chrome.action.onClicked.addListener((tab) => {
  if (tab.url) {
    sendToDesktopApp(tab.url);
  }
});
function sendToDesktopApp(url) {
  chrome.runtime.sendNativeMessage(
    NATIVE_HOST_NAME,
    { action: "install", url: url },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Failed to send to desktop app:",
          chrome.runtime.lastError.message,
        );
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Connection Failed",
          message:
            "Could not connect to ADB APK Installer Pro. Is the app running?",
        });
      } else {
        console.log("Received response from desktop app:", response);
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: response?.success ? "Download queued" : "Request not queued",
          message: response?.success ? "Download queued for review in ADB APK Installer Pro." : response?.error || "Request cancelled in the desktop app.",
        });
      }
    },
  );
}

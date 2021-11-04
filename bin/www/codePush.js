
 /******************************************************************************************** 
 	 THIS FILE HAS BEEN COMPILED FROM TYPESCRIPT SOURCES. 
 	 PLEASE DO NOT MODIFY THIS FILE DIRECTLY AS YOU WILL LOSE YOUR CHANGES WHEN RECOMPILING. 
 	 INSTEAD, EDIT THE TYPESCRIPT SOURCES UNDER THE WWW FOLDER, AND THEN RUN GULP. 
 	 FOR MORE INFORMATION, PLEASE SEE CONTRIBUTING.md. 
 *********************************************************************************************/ 


"use strict";
var LocalPackage = require("./localPackage");
var RemotePackage = require("./remotePackage");
var CodePushUtil = require("./codePushUtil");
var NativeAppInfo = require("./nativeAppInfo");
var SyncStatus = require("./syncStatus");
var CodePush = (function () {
    function CodePush() {
    }
    CodePush.prototype.notifyApplicationReady = function (notifySucceeded, notifyFailed) {
        cordova.exec(notifySucceeded, notifyFailed, "CodePush", "notifyApplicationReady", []);
    };
    CodePush.prototype.restartApplication = function (installSuccess, errorCallback) {
        cordova.exec(installSuccess, errorCallback, "CodePush", "restartApplication", []);
    };
    CodePush.prototype.reportStatus = function (status, label, appVersion, deploymentKey, previousLabelOrAppVersion, previousDeploymentKey) {
    };
    CodePush.prototype.getCurrentPackage = function (packageSuccess, packageError) {
        NativeAppInfo.isPendingUpdate(function (pendingUpdate) {
            var packageInfoFile = pendingUpdate ? LocalPackage.OldPackageInfoFile : LocalPackage.PackageInfoFile;
            LocalPackage.getPackageInfoOrNull(packageInfoFile, packageSuccess, packageError);
        });
    };
    CodePush.prototype.getPendingPackage = function (packageSuccess, packageError) {
        NativeAppInfo.isPendingUpdate(function (pendingUpdate) {
            if (pendingUpdate) {
                LocalPackage.getPackageInfoOrNull(LocalPackage.PackageInfoFile, packageSuccess, packageError);
            }
            else {
                packageSuccess(null);
            }
        });
    };
    CodePush.prototype.checkForUpdate = function (querySuccess, queryError, appVersion, downloadUrl) {
        try {
            var result = new RemotePackage();
            result.appVersion = appVersion;
            result.downloadUrl = downloadUrl;
            result.isMandatory = true;
            result.label = appVersion;
            result.packageHash = appVersion;
            result.failedInstall = false;
            CodePushUtil.logMessage("An update is available. " + JSON.stringify(result));
            querySuccess && querySuccess(result);
        }
        catch (e) {
            CodePushUtil.invokeErrorCallback(new Error("An error occurred while querying for updates." + CodePushUtil.getErrorMessage(e)), queryError);
        }
    };
    CodePush.prototype.sync = function (syncCallback, syncOptions, downloadProgress, syncErrback) {
        if (CodePush.SyncInProgress) {
            CodePushUtil.logMessage("Sync already in progress.");
            syncCallback && syncCallback(SyncStatus.IN_PROGRESS);
        }
        else {
            var syncCallbackAndUpdateSyncInProgress = function (err, result) {
                switch (result) {
                    case SyncStatus.ERROR:
                    case SyncStatus.IN_PROGRESS:
                    case SyncStatus.UP_TO_DATE:
                    case SyncStatus.UPDATE_IGNORED:
                    case SyncStatus.UPDATE_INSTALLED:
                        CodePush.SyncInProgress = false;
                    default:
                        break;
                }
                if (err) {
                    syncErrback && syncErrback(err);
                }
                syncCallback && syncCallback(result);
            };
            CodePush.SyncInProgress = true;
            this.syncInternal(syncCallbackAndUpdateSyncInProgress, syncOptions, downloadProgress);
        }
    };
    CodePush.prototype.syncInternal = function (syncCallback, syncOptions, downloadProgress) {
        if (!syncOptions) {
            syncOptions = this.getDefaultSyncOptions();
        }
        else {
            var defaultDialogOptions = this.getDefaultUpdateDialogOptions();
            if (syncOptions.updateDialog) {
                if (typeof syncOptions.updateDialog !== typeof ({})) {
                    syncOptions.updateDialog = defaultDialogOptions;
                }
                else {
                    CodePushUtil.copyUnassignedMembers(defaultDialogOptions, syncOptions.updateDialog);
                }
            }
            var defaultOptions = this.getDefaultSyncOptions();
            CodePushUtil.copyUnassignedMembers(defaultOptions, syncOptions);
        }
        window.codePush.notifyApplicationReady();
        var onError = function (error) {
            CodePushUtil.logError("An error occurred during sync.", error);
            syncCallback && syncCallback(error, SyncStatus.ERROR);
        };
        var onInstallSuccess = function (appliedWhen) {
            switch (appliedWhen) {
                case InstallMode.ON_NEXT_RESTART:
                    CodePushUtil.logMessage("Update is installed and will be run on the next app restart.");
                    break;
                case InstallMode.ON_NEXT_RESUME:
                    if (syncOptions.minimumBackgroundDuration > 0) {
                        CodePushUtil.logMessage("Update is installed and will be run after the app has been in the background for at least " + syncOptions.minimumBackgroundDuration + " seconds.");
                    }
                    else {
                        CodePushUtil.logMessage("Update is installed and will be run when the app next resumes.");
                    }
                    break;
            }
            syncCallback && syncCallback(null, SyncStatus.UPDATE_INSTALLED);
        };
        var onDownloadSuccess = function (localPackage) {
            syncCallback && syncCallback(null, SyncStatus.INSTALLING_UPDATE);
            localPackage.install(onInstallSuccess, onError, syncOptions);
        };
        var downloadAndInstallUpdate = function (remotePackage) {
            syncCallback && syncCallback(null, SyncStatus.DOWNLOADING_PACKAGE);
            remotePackage.download(onDownloadSuccess, onError, downloadProgress);
        };
        var onUpdate = function (remotePackage) {
            var updateShouldBeIgnored = remotePackage && (remotePackage.failedInstall && syncOptions.ignoreFailedUpdates);
            if (!remotePackage || updateShouldBeIgnored) {
                if (updateShouldBeIgnored) {
                    CodePushUtil.logMessage("An update is available, but it is being ignored due to have been previously rolled back.");
                }
                syncCallback && syncCallback(null, SyncStatus.UP_TO_DATE);
            }
            else {
                var dlgOpts = syncOptions.updateDialog;
                if (dlgOpts) {
                    CodePushUtil.logMessage("Awaiting user action.");
                    syncCallback && syncCallback(null, SyncStatus.AWAITING_USER_ACTION);
                }
                if (remotePackage.isMandatory && syncOptions.updateDialog) {
                    var message = dlgOpts.appendReleaseDescription ?
                        dlgOpts.mandatoryUpdateMessage + dlgOpts.descriptionPrefix + remotePackage.description
                        : dlgOpts.mandatoryUpdateMessage;
                    navigator.notification.alert(message, function () { downloadAndInstallUpdate(remotePackage); }, dlgOpts.updateTitle, dlgOpts.mandatoryContinueButtonLabel);
                }
                else if (!remotePackage.isMandatory && syncOptions.updateDialog) {
                    var optionalUpdateCallback = function (buttonIndex) {
                        switch (buttonIndex) {
                            case 1:
                                downloadAndInstallUpdate(remotePackage);
                                break;
                            case 2:
                            default:
                                CodePushUtil.logMessage("User cancelled the update.");
                                syncCallback && syncCallback(null, SyncStatus.UPDATE_IGNORED);
                                break;
                        }
                    };
                    var message = dlgOpts.appendReleaseDescription ?
                        dlgOpts.optionalUpdateMessage + dlgOpts.descriptionPrefix + remotePackage.description
                        : dlgOpts.optionalUpdateMessage;
                    navigator.notification.confirm(message, optionalUpdateCallback, dlgOpts.updateTitle, [dlgOpts.optionalInstallButtonLabel, dlgOpts.optionalIgnoreButtonLabel]);
                }
                else {
                    downloadAndInstallUpdate(remotePackage);
                }
            }
        };
        syncCallback && syncCallback(null, SyncStatus.CHECKING_FOR_UPDATE);
        window.codePush.checkForUpdate(onUpdate, onError, syncOptions.deploymentKey);
    };
    CodePush.prototype.getDefaultSyncOptions = function () {
        if (!CodePush.DefaultSyncOptions) {
            CodePush.DefaultSyncOptions = {
                ignoreFailedUpdates: true,
                installMode: InstallMode.ON_NEXT_RESTART,
                minimumBackgroundDuration: 0,
                mandatoryInstallMode: InstallMode.IMMEDIATE,
                updateDialog: false,
                deploymentKey: undefined
            };
        }
        return CodePush.DefaultSyncOptions;
    };
    CodePush.prototype.getDefaultUpdateDialogOptions = function () {
        if (!CodePush.DefaultUpdateDialogOptions) {
            CodePush.DefaultUpdateDialogOptions = {
                updateTitle: "Update available",
                mandatoryUpdateMessage: "An update is available that must be installed.",
                mandatoryContinueButtonLabel: "Continue",
                optionalUpdateMessage: "An update is available. Would you like to install it?",
                optionalInstallButtonLabel: "Install",
                optionalIgnoreButtonLabel: "Ignore",
                appendReleaseDescription: false,
                descriptionPrefix: " Description: "
            };
        }
        return CodePush.DefaultUpdateDialogOptions;
    };
    return CodePush;
}());
var ReportStatus;
(function (ReportStatus) {
    ReportStatus[ReportStatus["STORE_VERSION"] = 0] = "STORE_VERSION";
    ReportStatus[ReportStatus["UPDATE_CONFIRMED"] = 1] = "UPDATE_CONFIRMED";
    ReportStatus[ReportStatus["UPDATE_ROLLED_BACK"] = 2] = "UPDATE_ROLLED_BACK";
})(ReportStatus || (ReportStatus = {}));
var instance = new CodePush();
module.exports = instance;

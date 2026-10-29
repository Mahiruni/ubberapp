import fs from "node:fs";
import path from "node:path";
const role=process.argv[2];
if(!["rider","driver"].includes(role))throw new Error("role must be rider or driver");
const base="android/app/src/main";
const folder=path.join(base,"java/com/nexride",role);
fs.mkdirSync(folder,{recursive:true});

// Both signed native wrappers receive the same strictly role-bound plugin.
const live=fs.readFileSync("native/android/NexRideLiveTripPlugin.java","utf8")
  .replace("com.nexride.APP_ROLE","com.nexride."+role);
fs.writeFileSync(path.join(folder,"NexRideLiveTripPlugin.java"),live);

if(role==="driver"){
  for(const name of ["NexRideDriverLocationService.java","NexRideDriverLocationPlugin.java","NexRideDriverAlertChannels.java","BilooDriverSession.java","BilooDriverSessionStore.java","BilooRideAlertState.java","BilooDriverRideAlerts.java","BilooDriverRideAlertsPlugin.java","BilooDriverMessagingService.java","BilooRideAlertDismissReceiver.java"])
    fs.copyFileSync(path.join("native/android",name),path.join(folder,name));
  const testFolder="android/app/src/test/java/com/nexride/driver";
  fs.mkdirSync(testFolder,{recursive:true});
  fs.copyFileSync("native/android/test/BilooDriverSessionTest.java",path.join(testFolder,"BilooDriverSessionTest.java"));
  fs.copyFileSync("native/android/test/BilooRideAlertStateTest.java",path.join(testFolder,"BilooRideAlertStateTest.java"));
  for(const type of ["layout","drawable"]) {
    fs.mkdirSync(path.join(base,"res",type),{recursive:true});
    for(const file of fs.readdirSync(path.join("native/android/res",type)))
      fs.copyFileSync(path.join("native/android/res",type,file),path.join(base,"res",type,file));
  }
  const gradle="android/app/build.gradle";
  let build=fs.readFileSync(gradle,"utf8");
  if(!build.includes("org.json:json:")) build+='\ndependencies { testImplementation "org.json:json:20240303" }\n';
  // Match the stable SDK used by the pinned Capacitor PushNotifications 8.1.3.
  // The app's receiver subclasses it, so it needs a direct compile dependency.
  if(!build.includes("com.google.firebase:firebase-messaging:")) build+='\ndependencies { implementation "com.google.firebase:firebase-messaging:25.0.1" }\n';
  fs.writeFileSync(gradle,build);
  fs.mkdirSync(path.join(base,"res/xml"),{recursive:true});
  fs.copyFileSync("native/android/biloo_data_extraction_rules.xml",path.join(base,"res/xml/biloo_data_extraction_rules.xml"));
}

const main=path.join(folder,"MainActivity.java");
let source=fs.readFileSync(main,"utf8");
const installed=source.includes("registerPlugin(NexRideLiveTripPlugin.class);");
if(!installed){
  if(role==="driver"){
    if(!source.includes("registerPlugin(NexRideDriverLocationPlugin.class);")){
      source=source.replace("public class MainActivity extends BridgeActivity {",
        "public class MainActivity extends BridgeActivity {\n"+
        "  @Override public void onCreate(android.os.Bundle savedInstanceState){\n"+
        "    registerPlugin(NexRideDriverLocationPlugin.class);\n"+
        "    registerPlugin(NexRideLiveTripPlugin.class);\n"+
        "    registerPlugin(BilooDriverRideAlertsPlugin.class);\n"+
        "    super.onCreate(savedInstanceState);\n"+
        "    NexRideDriverAlertChannels.ensure(this);\n"+
        "  }\n");
    } else {
      source=source.replace("registerPlugin(NexRideDriverLocationPlugin.class);",
        "registerPlugin(NexRideDriverLocationPlugin.class);\n"+
        "    registerPlugin(NexRideLiveTripPlugin.class);");
    }
  } else {
    source=source.replace("public class MainActivity extends BridgeActivity {",
      "public class MainActivity extends BridgeActivity {\n"+
      "  @Override public void onCreate(android.os.Bundle savedInstanceState){\n"+
      "    registerPlugin(NexRideLiveTripPlugin.class);\n"+
      "    super.onCreate(savedInstanceState);\n"+
      "  }\n");
  }
}
if(!source.includes("registerPlugin(NexRideLiveTripPlugin.class);"))
  throw Error("Could not register NexRide Android Live Trip plugin");
if(role==="driver" && !source.includes("registerPlugin(BilooDriverRideAlertsPlugin.class);"))
  source=source.replace("registerPlugin(NexRideLiveTripPlugin.class);","registerPlugin(NexRideLiveTripPlugin.class);\n    registerPlugin(BilooDriverRideAlertsPlugin.class);");
// Keep Android-owned status/navigation icons visible on edge-to-edge devices.
// Insets are applied to the WebView content rather than hiding system bars.
if(!source.includes("BilooSystemBars.apply(this);")){
  source=source.replace("    super.onCreate(savedInstanceState);",
    "    super.onCreate(savedInstanceState);\n    BilooSystemBars.apply(this);");
}
fs.writeFileSync(path.join(folder,"BilooSystemBars.java"),
  fs.readFileSync("native/android/BilooSystemBars.java","utf8")
    .replace("com.nexride.APP_ROLE","com.nexride."+role));
fs.writeFileSync(main,source);

const manifest=path.join(base,"AndroidManifest.xml");
let xml=fs.readFileSync(manifest,"utf8");
if(!xml.includes('android:name="android.permission.POST_PROMOTED_NOTIFICATIONS"'))
  xml=xml.replace("<application",
    '<uses-permission android:name="android.permission.POST_PROMOTED_NOTIFICATIONS" />\n    <application');
if(role==="driver"){
  if(!xml.includes('xmlns:tools=')) xml=xml.replace('<manifest ','<manifest xmlns:tools="http://schemas.android.com/tools" ');
  if(!xml.includes('android:name=".BilooDriverMessagingService"'))
    xml=xml.replace('</application>', '<service android:name="com.capacitorjs.plugins.pushnotifications.MessagingService" tools:node="remove" />\n'+
      '<service android:name=".BilooDriverMessagingService" android:exported="false"><intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter></service>\n'+
      '<receiver android:name=".BilooRideAlertDismissReceiver" android:exported="false" />\n</application>');
  if(!xml.includes('android:dataExtractionRules='))
    xml=xml.replace("<application",'<application android:dataExtractionRules="@xml/biloo_data_extraction_rules"');
  for(const p of ["android.permission.FOREGROUND_SERVICE","android.permission.FOREGROUND_SERVICE_LOCATION","android.permission.WAKE_LOCK","android.permission.ACCESS_NETWORK_STATE"]){
    if(!xml.includes('android:name="'+p+'"'))
      xml=xml.replace("<application",'<uses-permission android:name="'+p+'" />\n    <application');
  }
  if(!xml.includes('android:name=".NexRideDriverLocationService"'))
    xml=xml.replace("</application>",'<service android:name=".NexRideDriverLocationService" android:exported="false" '+
      'android:foregroundServiceType="location" />\n    </application>');
}
fs.writeFileSync(manifest,xml);

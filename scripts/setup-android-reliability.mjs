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
  for(const name of ["NexRideDriverLocationService.java","NexRideDriverLocationPlugin.java","NexRideDriverAlertChannels.java"])
    fs.copyFileSync(path.join("native/android",name),path.join(folder,name));
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
  for(const p of ["android.permission.FOREGROUND_SERVICE","android.permission.FOREGROUND_SERVICE_LOCATION"]){
    if(!xml.includes('android:name="'+p+'"'))
      xml=xml.replace("<application",'<uses-permission android:name="'+p+'" />\n    <application');
  }
  if(!xml.includes('android:name=".NexRideDriverLocationService"'))
    xml=xml.replace("</application>",'<service android:name=".NexRideDriverLocationService" android:exported="false" '+
      'android:foregroundServiceType="location" />\n    </application>');
}
fs.writeFileSync(manifest,xml);

import fs from "node:fs";
import path from "node:path";
const role=process.argv[2];
if(!["rider","driver"].includes(role))throw new Error("role must be rider or driver");
if(role!=="driver")process.exit(0);
const base="android/app/src/main";
const folder=path.join(base,"java/com/nexride/driver");
fs.mkdirSync(folder,{recursive:true});
for(const name of ["NexRideDriverLocationService.java","NexRideDriverLocationPlugin.java","NexRideDriverAlertChannels.java"])
  fs.copyFileSync(path.join("native/android",name),path.join(folder,name));
const main=path.join(folder,"MainActivity.java");
let source=fs.readFileSync(main,"utf8");
if(!source.includes("registerPlugin(NexRideDriverLocationPlugin.class);"))
  source=source.replace("public class MainActivity extends BridgeActivity {",
    "public class MainActivity extends BridgeActivity {\n"+
    "  @Override public void onCreate(android.os.Bundle savedInstanceState){\n"+
    "    registerPlugin(NexRideDriverLocationPlugin.class);\n"+
    "    super.onCreate(savedInstanceState);\n"+
    "    NexRideDriverAlertChannels.ensure(this);\n"+
    "  }\n");
fs.writeFileSync(main,source);
const manifest=path.join(base,"AndroidManifest.xml");
let xml=fs.readFileSync(manifest,"utf8");
for(const p of ["android.permission.FOREGROUND_SERVICE","android.permission.FOREGROUND_SERVICE_LOCATION"]){
  if(!xml.includes('android:name="'+p+'"'))
    xml=xml.replace("<application",'<uses-permission android:name="'+p+'" />\n    <application');
}
if(!xml.includes('android:name=".NexRideDriverLocationService"'))
  xml=xml.replace("</application>",'<service android:name=".NexRideDriverLocationService" android:exported="false" '+
    'android:foregroundServiceType="location" />\n    </application>');
fs.writeFileSync(manifest,xml);

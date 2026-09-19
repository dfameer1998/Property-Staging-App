package com.space.staging;
import android.app.*;
import android.os.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private static final Backend api=new Backend();
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private LinearLayout root; private TextView status; private JSONObject project,space; private boolean busy=false;
 private static final int PICK=101,SCAN=102;
 interface Job {void run()throws Exception;}
 @Override public void onCreate(Bundle state){super.onCreate(state);getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);if(api.signedIn())loadProjects();else login();}
 private void page(String title,String subtitle){
  ScrollView scroll=new ScrollView(this);root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(28,56,28,32);root.setBackgroundColor(Color.rgb(245,244,239));scroll.setFillViewport(true);scroll.addView(root);setContentView(scroll);
  TextView heading=text(title,30);heading.setTypeface(null,1);text(subtitle,15);status=text("",13);
 }
 private TextView text(String value,int size){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(Color.rgb(33,50,43));v.setPadding(0,8,0,12);root.addView(v);return v;}
 private EditText input(String hint,boolean password){EditText e=new EditText(this);e.setHint(hint);e.setSingleLine();e.setInputType(password?InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD:InputType.TYPE_CLASS_TEXT);root.addView(e);return e;}
 private Button button(String label,Runnable action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);root.addView(b);b.setOnClickListener(v->{if(!busy)action.run();});return b;}
 private void work(String label,Job job,Runnable done){if(busy)return;busy=true;status.setText(label);worker.execute(()->{try{job.run();runOnUiThread(()->{if(isDestroyed())return;busy=false;status.setText("");done.run();});}catch(Exception e){runOnUiThread(()->{if(isDestroyed())return;busy=false;status.setText("Please try again.");new AlertDialog.Builder(this).setTitle("Space Staging").setMessage(e.getMessage()).setPositiveButton("OK",null).show();});}});}
 private void login(){project=null;space=null;page("Make room for\nsomething better.","Capture your space. Save your ideas. Build your next room.");EditText email=input("Email",false);email.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);EditText pass=input("Password",true);
  button("Sign in",()->work("Signing in…",()->api.authenticate(email.getText().toString(),pass.getText().toString(),false),()->{pass.setText("");loadProjects();}));
  button("Create account",()->{if(pass.length()<8){status.setText("Use at least 8 characters for your password.");return;}work("Creating account…",()->api.authenticate(email.getText().toString(),pass.getText().toString(),true),()->{pass.setText("");loadProjects();});});
  text("Early beta · Spaces are private. Sign in again after closing the app.",13);
 }
 private JSONArray loaded=new JSONArray();
 private void loadProjects(){project=null;space=null;page("Your projects","A home for sale, a rental to furnish, or a place to gather.");button("Retry / Refresh",this::loadProjects);work("Loading…",()->loaded=api.rows("projects?select=*&order=created_at.desc&limit=100"),()->{page("Your projects","Start with a place. Add its rooms and outdoor spaces.");for(int i=0;i<loaded.length();i++){JSONObject row=loaded.optJSONObject(i);button(row.optString("name"),()->{project=row;loadSpaces();});}button("New project",()->nameDialog("New project",name->api.insert("projects",new JSONObject().put("name",name)),this::loadProjects));button("Sign out",()->work("Signing out…",api::signOut,this::login));});}
 interface NamedJob {void run(String value)throws Exception;}
 private void nameDialog(String title,NamedJob job,Runnable done){EditText name=new EditText(this);name.setHint("Name");new AlertDialog.Builder(this).setTitle(title).setView(name).setNegativeButton("Cancel",null).setPositiveButton("Save",(dialog,which)->{String value=name.getText().toString().trim();if(!value.isEmpty())work("Saving…",()->job.run(value),done);}).show();}
 private void loadSpaces(){space=null;page(project.optString("name"),"Choose a space to capture.");button("Retry / Refresh",this::loadSpaces);work("Loading…",()->loaded=api.rows("spaces?project_id=eq."+project.optString("id")+"&select=*&order=created_at&limit=100"),()->{page(project.optString("name"),"Choose a room or outdoor space.");for(int i=0;i<loaded.length();i++){JSONObject row=loaded.optJSONObject(i);button(row.optString("name"),()->{space=row;loadSpace();});}button("Add room",()->addSpace(false));button("Add outdoor space",()->addSpace(true));button("All projects",this::loadProjects);});}
 private void addSpace(boolean exterior){nameDialog("New space",name->api.insert("spaces",new JSONObject().put("project_id",project.optString("id")).put("name",name).put("environment",exterior?"exterior":"interior").put("kind",exterior?"backyard":"living_room")),this::loadSpaces);}
 private JSONArray scans=new JSONArray(),assets=new JSONArray(),briefs=new JSONArray();
 private void loadSpace(){page(space.optString("name"),"Capture, measure, and choose your design direction.");button("Retry / Refresh",this::loadSpace);String id=space.optString("id");work("Loading…",()->{scans=api.rows("captures?space_id=eq."+id+"&select=*&order=created_at.desc&limit=100");assets=api.rows("media?space_id=eq."+id+"&select=*&order=created_at.desc&limit=100");briefs=api.rows("design_briefs?space_id=eq."+id+"&select=*&order=created_at.desc&limit=1");},()->{
  page(space.optString("name"),"Capture, measure, and choose your design direction.");button("Measure floor corners",()->startActivityForResult(new Intent(this,ScanActivity.class),SCAN));button("Enter reference measurements",this::manual);button("Import photo or short video",()->{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("*/*");intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/jpeg","image/png","video/mp4","video/quicktime"});startActivityForResult(intent,PICK);});
  text("Use the phone camera to take photos or videos, then import them here. Files are limited to 10 MB in this beta.",13);text("Saved captures",22);
  for(int i=0;i<scans.length();i++)text(String.format(java.util.Locale.US,"%.2f m² estimated floor · Needs verification",scans.optJSONObject(i).optDouble("floor_area_m2")),15);
  for(int i=0;i<assets.length();i++){JSONObject asset=assets.optJSONObject(i);text(asset.optString("mime_type")+" · "+asset.optString("status"),14);}
  text("Your design direction",22);Spinner style=new Spinner(this);String[] choices={"modern","contemporary","scandinavian","japandi","traditional","coastal","mid_century","industrial","bohemian","custom"};style.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,choices));root.addView(style);EditText notes=input("Colors, mood, items to keep…",false);notes.setSingleLine(false);notes.setMinLines(3);notes.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(4000)});
  if(briefs.length()>0){JSONObject brief=briefs.optJSONObject(0);notes.setText(brief.optString("instructions"));for(int i=0;i<choices.length;i++)if(choices[i].equals(brief.optString("style")))style.setSelection(i);}
  button("Save design brief",()->{String selected=style.getSelectedItem().toString(),instructions=notes.getText().toString();work("Saving…",()->api.insert("design_briefs",new JSONObject().put("space_id",id).put("style",selected).put("instructions",instructions)),()->status.setText("Design brief saved."));});text("AI rendering and shopping will be added in a later beta.",13);button("Back to spaces",this::loadSpaces);
 });}
 private void manual(){LinearLayout form=new LinearLayout(this);form.setOrientation(1);EditText w=new EditText(this),d=new EditText(this),h=new EditText(this);w.setHint("Width in meters");d.setHint("Depth in meters");h.setHint("Ceiling in meters (optional)");for(EditText e:new EditText[]{w,d,h}){e.setInputType(InputType.TYPE_CLASS_NUMBER|InputType.TYPE_NUMBER_FLAG_DECIMAL);form.addView(e);}new AlertDialog.Builder(this).setTitle("Rectangular floor only").setMessage("Use a tape or laser measure. This entry remains unverified for furniture fit.").setView(form).setNegativeButton("Cancel",null).setPositiveButton("Save",(dialog,which)->{String sw=w.getText().toString(),sd=d.getText().toString(),sh=h.getText().toString();work("Saving…",()->{double width=Double.parseDouble(sw),depth=Double.parseDouble(sd);JSONArray p=new JSONArray().put(new JSONArray(new double[]{0,0,0})).put(new JSONArray(new double[]{width,0,0})).put(new JSONArray(new double[]{width,0,depth})).put(new JSONArray(new double[]{0,0,depth}));api.saveFloor(p,"reference_measurement",space.optString("id"),sh.isBlank()?null:Double.valueOf(sh));},this::loadSpace);}).show();}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(result!=RESULT_OK||data==null||space==null)return;String id=space.optString("id");
  if(request==SCAN){String points=data.getStringExtra("points"),route=data.getStringExtra("route");work("Saving floor…",()->api.saveFloor(new JSONArray(points),route,id,null),this::loadSpace);}
  if(request==PICK&&data.getData()!=null){Uri uri=data.getData();work("Uploading…",()->{String mime=getContentResolver().getType(uri);if(mime==null||!java.util.List.of("image/jpeg","image/png","video/mp4","video/quicktime").contains(mime))throw new IOException("Choose a JPEG, PNG, MP4, or MOV file.");try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream out=new ByteArrayOutputStream()){if(in==null)throw new IOException("Could not open this file.");byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(out.size()+n>10*1024*1024)throw new IOException("Choose a file under 10 MB.");out.write(buf,0,n);}api.upload(out.toByteArray(),mime,id);}},this::loadSpace);}
 }
 @Override public void onBackPressed(){if(busy)return;if(space!=null)loadSpaces();else if(project!=null)loadProjects();else super.onBackPressed();}
 @Override protected void onDestroy(){worker.shutdown();super.onDestroy();}
}

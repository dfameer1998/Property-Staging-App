package com.space.staging;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

final class Backend {
 private String token="",refresh="",user=""; private long expires=0;
 boolean signedIn(){return !token.isEmpty();}
 void authenticate(String email,String password,boolean create)throws Exception{
  JSONObject result=(JSONObject)request(create?"/auth/v1/signup":"/auth/v1/token?grant_type=password","POST",new JSONObject().put("email",email.trim()).put("password",password),null,"application/json",false);
  if(!result.has("access_token"))throw new IOException("Check your email to confirm your account, then sign in."); accept(result);
 }
 private void accept(JSONObject result)throws JSONException{token=result.getString("access_token");refresh=result.getString("refresh_token");user=result.getJSONObject("user").getString("id");expires=System.currentTimeMillis()+result.optLong("expires_in",3600)*1000;}
 void signOut(){try{request("/auth/v1/logout?scope=local","POST",null,null,"application/json",true);}catch(Exception ignored){}token="";refresh="";user="";}
 private void refreshIfNeeded()throws Exception{if(System.currentTimeMillis()+60000<expires)return;if(refresh.isEmpty())throw new IOException("Sign in again.");accept((JSONObject)request("/auth/v1/token?grant_type=refresh_token","POST",new JSONObject().put("refresh_token",refresh),null,"application/json",false));}
 Object request(String path,String method,JSONObject json,byte[] bytes,String mime,boolean auth)throws Exception{
  if(auth)refreshIfNeeded();
  HttpURLConnection con=(HttpURLConnection)new URL(BackendConfig.URL+path).openConnection();
  con.setRequestMethod(method);con.setConnectTimeout(20000);con.setReadTimeout(60000);con.setRequestProperty("apikey",BackendConfig.KEY);con.setRequestProperty("Content-Type",mime);con.setRequestProperty("Prefer","return=representation");
  if(auth)con.setRequestProperty("Authorization","Bearer "+token);
  try{byte[] body=json!=null?json.toString().getBytes(StandardCharsets.UTF_8):bytes;
   if(body!=null){con.setDoOutput(true);con.setFixedLengthStreamingMode(body.length);try(OutputStream out=con.getOutputStream()){out.write(body);}}
   int status=con.getResponseCode();InputStream stream=status>=400?con.getErrorStream():con.getInputStream();String text="";
   if(stream!=null)try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buf=new byte[8192];int n;while((n=in.read(buf))!=-1){if(out.size()+n>2*1024*1024)throw new IOException("Response is too large.");out.write(buf,0,n);}text=out.toString("UTF-8");}
   Object result=text.trim().isEmpty()?new JSONObject():new JSONTokener(text).nextValue();
   if(status<200||status>=300){JSONObject e=result instanceof JSONObject?(JSONObject)result:new JSONObject();throw new IOException(e.optString("msg",e.optString("message",e.optString("error_description",e.optString("error","Request failed. Please retry.")))));}
   return result;
  }finally{con.disconnect();}
 }
 JSONArray rows(String path)throws Exception{return (JSONArray)request("/rest/v1/"+path,"GET",null,null,"application/json",true);}
 void insert(String table,JSONObject data)throws Exception{request("/rest/v1/"+table,"POST",data,null,"application/json",true);}
 void upload(byte[] bytes,String mime,String space)throws Exception{
  if(bytes.length==0||bytes.length>10*1024*1024)throw new IOException("Use a photo or short video under 10 MB.");
  String id=UUID.randomUUID().toString(),path=user+"/"+space+"/"+id;
  insert("media",new JSONObject().put("id",id).put("space_id",space).put("object_path",path).put("mime_type",mime).put("byte_size",bytes.length));
  request("/storage/v1/object/space-media/"+path,"POST",null,bytes,mime,true);
  request("/rest/v1/media?id=eq."+id,"PATCH",new JSONObject().put("status","ready"),null,"application/json",true);
 }
 void saveFloor(JSONArray points,String route,String space,Double ceiling)throws Exception{
  JSONObject data=new JSONObject().put("id",UUID.randomUUID().toString()).put("spaceId",space).put("schemaVersion",1).put("platform","android").put("route",route).put("unit","m").put("coordinateSystem","right_handed_y_up").put("floorPoints",points);
  if(ceiling!=null)data.put("ceilingHeightM",ceiling);
  request("/functions/v1/capture","POST",data,null,"application/json",true);
 }
}

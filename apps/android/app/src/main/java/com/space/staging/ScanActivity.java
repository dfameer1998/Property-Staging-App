package com.space.staging;
import android.Manifest;
import android.app.*;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.opengl.*;
import android.view.*;
import android.widget.*;
import com.google.ar.core.*;
import org.json.*;
import java.nio.*;
import java.util.*;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public class ScanActivity extends Activity implements GLSurfaceView.Renderer {
 private GLSurfaceView surface; private TextView guidance; private Session session;
 private boolean installRequested=false; private volatile boolean active=false; private int width=1,height=1,texture,program,markerProgram;
 private final List<Anchor> points=new ArrayList<>(); private volatile android.graphics.PointF pendingTap;
 private final FloatBuffer quad=buffer(new float[]{-1,-1,1,-1,-1,1,1,1}),uv=buffer(new float[8]);
 private static FloatBuffer buffer(float[] values){FloatBuffer b=ByteBuffer.allocateDirect(values.length*4).order(ByteOrder.nativeOrder()).asFloatBuffer();b.put(values).position(0);return b;}
 @Override public void onCreate(Bundle state){super.onCreate(state);FrameLayout layout=new FrameLayout(this);surface=new GLSurfaceView(this);surface.setEGLContextClientVersion(2);surface.setPreserveEGLContextOnPause(true);surface.setRenderer(this);layout.addView(surface);
  LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(24,20,24,30);panel.setBackgroundColor(0xEEFFFFFF);guidance=new TextView(this);guidance.setText("Move slowly to find the floor. Tap each corner in order.");panel.addView(guidance);
  LinearLayout buttons=new LinearLayout(this);Button cancel=new Button(this),undo=new Button(this),save=new Button(this);cancel.setText("Cancel");undo.setText("Undo");save.setText("Save floor");buttons.addView(cancel);buttons.addView(undo);buttons.addView(save);panel.addView(buttons);FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);layout.addView(panel,params);setContentView(layout);
  cancel.setOnClickListener(v->finish());undo.setOnClickListener(v->surface.queueEvent(()->{if(!points.isEmpty())points.remove(points.size()-1).detach();say(points.size()+" corners marked.");}));save.setOnClickListener(v->surface.queueEvent(this::save));
  surface.setOnTouchListener((v,event)->{if(event.getAction()==android.view.MotionEvent.ACTION_UP){pendingTap=new android.graphics.PointF(event.getX(),event.getY());v.performClick();}return true;});
 }
 private void say(String text){runOnUiThread(()->guidance.setText(text));}
 @Override protected void onResume(){super.onResume();if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},1);return;}startSession();}
 private void startSession(){try{if(session==null){ArCoreApk.Availability availability=ArCoreApk.getInstance().checkAvailability(this);if(availability.isUnsupported()){say("This phone does not support AR scanning. Use reference measurements instead.");return;}if(ArCoreApk.getInstance().requestInstall(this,!installRequested)==ArCoreApk.InstallStatus.INSTALL_REQUESTED){installRequested=true;return;}session=new Session(this);Config config=new Config(session);config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL);session.configure(config);}session.resume();active=true;surface.onResume();}catch(Exception e){say("Camera tracking could not start. Use reference measurements or retry: "+e.getLocalizedMessage());}}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==1&&results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startSession();else say("Camera permission is needed. Enable it in Settings, or use reference measurements.");}
 @Override protected void onPause(){super.onPause();active=false;surface.onPause();if(session!=null)session.pause();}
 @Override protected void onDestroy(){if(session!=null){for(Anchor a:points)a.detach();session.close();}super.onDestroy();}
 private int shader(int type,String source){int s=GLES20.glCreateShader(type);GLES20.glShaderSource(s,source);GLES20.glCompileShader(s);int[] status=new int[1];GLES20.glGetShaderiv(s,GLES20.GL_COMPILE_STATUS,status,0);if(status[0]==0)throw new IllegalStateException("Camera display shader failed.");return s;}
 private int program(String vertex,String fragment){int p=GLES20.glCreateProgram();int v=shader(GLES20.GL_VERTEX_SHADER,vertex),f=shader(GLES20.GL_FRAGMENT_SHADER,fragment);GLES20.glAttachShader(p,v);GLES20.glAttachShader(p,f);GLES20.glLinkProgram(p);GLES20.glDeleteShader(v);GLES20.glDeleteShader(f);int[] status=new int[1];GLES20.glGetProgramiv(p,GLES20.GL_LINK_STATUS,status,0);if(status[0]==0)throw new IllegalStateException("Camera display failed.");return p;}
 @Override public void onSurfaceCreated(GL10 gl,EGLConfig config){try{int[] ids=new int[1];GLES20.glGenTextures(1,ids,0);texture=ids[0];GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,texture);GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,GLES20.GL_TEXTURE_MIN_FILTER,GLES20.GL_LINEAR);GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,GLES20.GL_TEXTURE_MAG_FILTER,GLES20.GL_LINEAR);GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,GLES20.GL_TEXTURE_WRAP_S,GLES20.GL_CLAMP_TO_EDGE);GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,GLES20.GL_TEXTURE_WRAP_T,GLES20.GL_CLAMP_TO_EDGE);
  program=program("attribute vec2 p;attribute vec2 uv;varying vec2 tex;void main(){gl_Position=vec4(p,0.,1.);tex=uv;}","#extension GL_OES_EGL_image_external : require\nprecision mediump float;uniform samplerExternalOES camera;varying vec2 tex;void main(){gl_FragColor=texture2D(camera,tex);}");
  markerProgram=program("attribute vec3 p;uniform mat4 matrix;void main(){gl_Position=matrix*vec4(p,1.);gl_PointSize=20.;}","precision mediump float;void main(){gl_FragColor=vec4(.15,.9,.65,1.);}");
 }catch(Exception e){say(e.getMessage());}}
 @Override public void onSurfaceChanged(GL10 gl,int w,int h){width=w;height=h;GLES20.glViewport(0,0,w,h);}
 @Override public void onDrawFrame(GL10 gl){GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT|GLES20.GL_DEPTH_BUFFER_BIT);if(session==null||!active||program==0)return;try{
  session.setDisplayGeometry(getWindowManager().getDefaultDisplay().getRotation(),width,height);session.setCameraTextureName(texture);Frame frame=session.update();
  frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,quad,Coordinates2d.TEXTURE_NORMALIZED,uv);quad.position(0);uv.position(0);
  GLES20.glDisable(GLES20.GL_DEPTH_TEST);GLES20.glUseProgram(program);GLES20.glActiveTexture(GLES20.GL_TEXTURE0);GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES,texture);GLES20.glUniform1i(GLES20.glGetUniformLocation(program,"camera"),0);int p=GLES20.glGetAttribLocation(program,"p"),t=GLES20.glGetAttribLocation(program,"uv");GLES20.glEnableVertexAttribArray(p);GLES20.glEnableVertexAttribArray(t);GLES20.glVertexAttribPointer(p,2,GLES20.GL_FLOAT,false,0,quad);GLES20.glVertexAttribPointer(t,2,GLES20.GL_FLOAT,false,0,uv);GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP,0,4);GLES20.glDisableVertexAttribArray(p);GLES20.glDisableVertexAttribArray(t);
  android.graphics.PointF tap=pendingTap;pendingTap=null;
  if(tap!=null){if(frame.getCamera().getTrackingState()!=TrackingState.TRACKING){say("Tracking is settling. Move slowly and try again.");}else{boolean found=false;for(HitResult hit:frame.hitTest(tap.x,tap.y)){if(hit.getTrackable() instanceof Plane plane&&plane.getType()==Plane.Type.HORIZONTAL_UPWARD_FACING&&plane.isPoseInPolygon(hit.getHitPose())){if(!points.isEmpty()&&Math.abs(hit.getHitPose().ty()-points.get(0).getPose().ty())>.15){say("Use corners on the same floor level.");found=true;break;}if(points.size()<128){points.add(hit.createAnchor());say(points.size()+" corners marked. Continue around the perimeter.");}found=true;break;}}if(!found)say("No floor found here. Move around to scan more of it.");}}
  if(!points.isEmpty()){float[] view=new float[16],projection=new float[16],matrix=new float[16];frame.getCamera().getViewMatrix(view,0);frame.getCamera().getProjectionMatrix(projection,0,.1f,100f);android.opengl.Matrix.multiplyMM(matrix,0,projection,0,view,0);float[] xyz=new float[points.size()*3];for(int i=0;i<points.size();i++){Pose pose=points.get(i).getPose();xyz[i*3]=pose.tx();xyz[i*3+1]=pose.ty();xyz[i*3+2]=pose.tz();}GLES20.glUseProgram(markerProgram);int a=GLES20.glGetAttribLocation(markerProgram,"p");GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(markerProgram,"matrix"),1,false,matrix,0);GLES20.glEnableVertexAttribArray(a);GLES20.glVertexAttribPointer(a,3,GLES20.GL_FLOAT,false,0,buffer(xyz));GLES20.glDrawArrays(GLES20.GL_POINTS,0,points.size());GLES20.glDisableVertexAttribArray(a);}
 }catch(Exception e){say("Tracking paused. If it does not recover, cancel and scan again.");}}
 private void save(){try{if(points.size()<3){say("Mark at least three corners.");return;}JSONArray data=new JSONArray();for(Anchor anchor:points){if(anchor.getTrackingState()!=TrackingState.TRACKING){say("Wait for tracking to recover before saving.");return;}Pose p=anchor.getPose();data.put(new JSONArray(new double[]{p.tx(),p.ty(),p.tz()}));}Intent result=new Intent().putExtra("points",data.toString()).putExtra("route","arcore_guided");runOnUiThread(()->{setResult(RESULT_OK,result);finish();});}catch(Exception e){say("Could not save the scan. Please retry.");}}
}

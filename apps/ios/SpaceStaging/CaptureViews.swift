import SwiftUI
import ARKit
import RoomPlan
import AVFoundation
import UniformTypeIdentifiers

@MainActor final class FloorModel:NSObject,ObservableObject,ARSessionDelegate {
 let view=ARSCNView(frame:.zero)
 @Published var points:[[Double]]=[]
 @Published var guidance="Move slowly to find the floor. Tap each corner in order."
 private var markers:[SCNNode]=[]
 override init(){super.init();view.session.delegate=self;view.scene=SCNScene();view.addGestureRecognizer(UITapGestureRecognizer(target:self,action:#selector(tap(_:))))}
 func start(){AVCaptureDevice.requestAccess(for:.video){allowed in Task{@MainActor in if allowed {let config=ARWorldTrackingConfiguration();config.planeDetection=[.horizontal];self.view.session.run(config)}else{self.guidance="Camera permission is needed. Enable it in Settings."}}}}
 @objc private func tap(_ gesture:UITapGestureRecognizer){
  guard case .normal = view.session.currentFrame?.camera.trackingState else {guidance="Move slowly until tracking settles.";return}
  guard let query=view.raycastQuery(from:gesture.location(in:view),allowing:.existingPlaneGeometry,alignment:.horizontal),let hit=view.session.raycast(query).first else {guidance="Floor not found here. Move around to scan more of it.";return}
  let t=hit.worldTransform.columns.3, p=[Double(t.x),Double(t.y),Double(t.z)]
  if let first=points.first,abs(first[1]-p[1])>0.15 {guidance="Select all corners on the same floor level.";return}
  if points.count>=128{return}
  points.append(p);let node=SCNNode(geometry:SCNSphere(radius:0.025));node.geometry?.firstMaterial?.diffuse.contents=UIColor.systemMint;node.position=SCNVector3(t.x,t.y,t.z);view.scene.rootNode.addChildNode(node);markers.append(node)
  guidance="\(points.count) corners marked. Continue around the perimeter."
 }
 func undo(){if !points.isEmpty{points.removeLast();markers.removeLast().removeFromParentNode()};guidance="\(points.count) corners marked."}
 nonisolated func sessionWasInterrupted(_ session:ARSession){Task{@MainActor in self.reset();self.guidance="Scan interrupted. Please mark the corners again."}}
 nonisolated func session(_ session:ARSession,didFailWithError error:Error){Task{@MainActor in self.guidance=error.localizedDescription}}
 func reset(){points=[];markers.forEach{$0.removeFromParentNode()};markers=[]}
}
struct ARSurface:UIViewRepresentable {
 let model:FloorModel
 func makeUIView(context:Context)->ARSCNView{model.start();return model.view}
 func updateUIView(_ uiView:ARSCNView,context:Context){}
 static func dismantleUIView(_ uiView:ARSCNView,coordinator:()){uiView.session.pause()}
}
struct GuidedScan:View {
 @Environment(\.dismiss) var dismiss
 @StateObject private var model=FloorModel()
 let saved:([[Double]])->Void
 var body:some View {ZStack(alignment:.bottom){ARSurface(model:model).ignoresSafeArea();VStack(spacing:12){Text(model.guidance).font(.headline);Text("Mark the floor boundary clockwise. Measurements remain estimates.").font(.caption);HStack{Button("Cancel"){dismiss()};Spacer();Button("Undo"){model.undo()}.disabled(model.points.isEmpty);Button("Save floor"){saved(model.points)}.buttonStyle(.borderedProminent).disabled(model.points.count<3)}}.padding().background(.regularMaterial)}}
}
@MainActor final class RoomModel:NSObject,ObservableObject,RoomCaptureViewDelegate {
 let view=RoomCaptureView(frame:.zero)
 @Published var error:String?
 var saved:((Data)->Void)?
 override init(){super.init();view.delegate=self}
 func start(){AVCaptureDevice.requestAccess(for:.video){allowed in Task{@MainActor in if allowed{self.view.captureSession.run(configuration:RoomCaptureSession.Configuration())}else{self.error="Camera permission is needed in Settings."}}}}
 nonisolated func captureView(shouldPresent roomDataForProcessing:CapturedRoomData,error:Error?)->Bool{error==nil}
 nonisolated func captureView(didPresent processedResult:CapturedRoom,error:Error?){
  if let error {Task{@MainActor in self.error=error.localizedDescription};return}
  do{let data=try JSONEncoder().encode(processedResult);Task{@MainActor in self.saved?(data)}}catch{Task{@MainActor in self.error=error.localizedDescription}}
 }
}
struct RoomSurface:UIViewRepresentable {
 let model:RoomModel
 func makeUIView(context:Context)->RoomCaptureView{model.start();return model.view}
 func updateUIView(_ uiView:RoomCaptureView,context:Context){}
 static func dismantleUIView(_ uiView:RoomCaptureView,coordinator:()){uiView.captureSession.stop()}
}
struct RoomScan:View {
 @Environment(\.dismiss) var dismiss
 @StateObject private var model=RoomModel()
 @State private var processing=false
 let saved:(Data)->Void
 var body:some View {ZStack(alignment:.bottom){RoomSurface(model:model).ignoresSafeArea();VStack{Text(model.error ?? "Move slowly and follow the room scan guidance.");HStack{Button("Cancel"){dismiss()};Spacer();Button(processing ? "Processing…":"Finish room scan"){processing=true;model.view.captureSession.stop()}.disabled(processing)}}.padding().background(.regularMaterial)}.onAppear{model.saved=saved}}
}
struct ReferenceMeasurements:View {
 @Environment(\.dismiss) var dismiss
 @State private var width="",depth="",height=""
 let saved:([[Double]],Double?)->Void
 var w:Double{Double(width) ?? 0};var d:Double{Double(depth) ?? 0}
 var body:some View {NavigationStack{Form{Section("Rectangular floor only · meters"){TextField("Width",text:$width);TextField("Depth",text:$depth);TextField("Ceiling height (optional)",text:$height)}.keyboardType(.decimalPad);Text("Use a tape or laser measure. For irregular rooms, use the guided corner scan. Entry alone does not confirm furniture fit.").font(.footnote);Button("Save reference floor"){saved([[0,0,0],[w,0,0],[w,0,d],[0,0,d]],Double(height))}.disabled(w<=0 || d<=0 || w>100 || d>100)}.navigationTitle("Reference dimensions").toolbar{Button("Cancel"){dismiss()}}}}
}
struct MediaPicker:UIViewControllerRepresentable {
 @Environment(\.dismiss) var dismiss
 @EnvironmentObject var api:Backend
 let camera:Bool
 let saved:(Data,String)->Void
 func makeCoordinator()->Coordinator{Coordinator(self)}
 func makeUIViewController(context:Context)->UIImagePickerController{
  let view=UIImagePickerController();view.delegate=context.coordinator
  view.sourceType=camera && UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera:.photoLibrary
  view.mediaTypes=[UTType.image.identifier,UTType.movie.identifier];view.videoMaximumDuration=15;view.videoQuality = .typeMedium
  return view
 }
 func updateUIViewController(_ uiViewController:UIImagePickerController,context:Context){}
 final class Coordinator:NSObject,UIImagePickerControllerDelegate,UINavigationControllerDelegate {
  let parent:MediaPicker;init(_ parent:MediaPicker){self.parent=parent}
  func imagePickerControllerDidCancel(_ picker:UIImagePickerController){parent.dismiss()}
  func imagePickerController(_ picker:UIImagePickerController,didFinishPickingMediaWithInfo info:[UIImagePickerController.InfoKey:Any]){
   if let image=info[.originalImage] as? UIImage,let data=image.jpegData(compressionQuality:0.85){parent.saved(data,"image/jpeg");return}
   if let url=info[.mediaURL] as? URL {
    do{let count=try url.resourceValues(forKeys:[.fileSizeKey]).fileSize ?? 0;guard count<=10*1024*1024 else{throw AppFailure(message:"Choose a shorter video under 10 MB.")};let data=try Data(contentsOf:url);parent.saved(data,url.pathExtension.lowercased()=="mp4" ? "video/mp4":"video/quicktime")}
    catch{parent.dismiss();parent.api.message=error.localizedDescription}
   }else{parent.dismiss();parent.api.message="This media could not be imported."}
  }
 }
}

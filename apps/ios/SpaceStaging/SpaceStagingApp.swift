import SwiftUI
import ARKit
import RoomPlan
import UniformTypeIdentifiers
import AVKit

@main struct SpaceStagingApp: App {
 @StateObject private var backend=Backend()
 var body: some Scene { WindowGroup { RootView().environmentObject(backend).tint(Color(red:0.14,green:0.40,blue:0.32)) } }
}
struct RootView:View {
 @EnvironmentObject var api:Backend
 var body:some View { Group { if api.signedIn { ProjectsView() } else { LoginView() } }.alert("Space Staging",isPresented:Binding(get:{api.message != nil},set:{if !$0 {api.message=nil}})){Button("OK"){api.message=nil}} message:{Text(api.message ?? "")} }
}
struct LoginView:View {
 @EnvironmentObject var api:Backend
 @State private var email=""
 @State private var password=""
 @State private var busy=false
 var body:some View {
  NavigationStack { VStack(alignment:.leading,spacing:22) {
   Image(systemName:"house.and.flag.fill").font(.system(size:44)).foregroundStyle(.tint)
   Text("Make room for\nsomething better.").font(.largeTitle.bold())
   Text("Capture your space. Save your ideas. Build your next room.").foregroundStyle(.secondary)
   TextField("Email",text:$email).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
   SecureField("Password",text:$password).textContentType(.password)
   Button(busy ? "Please wait…":"Sign in"){auth(false)}.buttonStyle(.borderedProminent).disabled(busy || email.isEmpty || password.isEmpty)
   Button("Create account"){auth(true)}.disabled(busy || email.isEmpty || password.count<8)
   Text("Early beta · Your saved spaces are private. Sign in again when you reopen the app.").font(.footnote).foregroundStyle(.secondary)
   Spacer()
  }.padding(28).textFieldStyle(.roundedBorder).padding(.top,40) }
 }
 func auth(_ create:Bool){busy=true;Task{defer{busy=false};do{try await api.authenticate(email:email,password:password,create:create);password=""}catch{api.message=error.localizedDescription}}}
}
struct ProjectsView:View {
 @EnvironmentObject var api:Backend
 @State private var rows:[Record]=[]
 @State private var adding=false
 @State private var name=""
 @State private var busy=false
 var body:some View {
  NavigationStack { List {
   Section { Text("Your next space starts here.").font(.title2.bold());Text("A home for sale, a rental to furnish, or a place to gather.").foregroundStyle(.secondary) }
   if rows.isEmpty { ContentUnavailableView("Create your first project",systemImage:"house",description:Text("Keep rooms, media, and design ideas together.")) }
   ForEach(rows){row in NavigationLink{SpacesView(project:row)}label:{Label(row.text("name"),systemImage:"house.fill").padding(.vertical,8)}}
  }.navigationTitle("Your projects").toolbar{ToolbarItem(placement:.topBarTrailing){Button("New project",systemImage:"plus"){adding=true}};ToolbarItem(placement:.topBarLeading){Button("Sign out"){Task{await api.signOut()}}}}
  .task{await load()}.refreshable{await load()}
  .alert("New project",isPresented:$adding){TextField("Project name",text:$name);Button("Create"){create()};Button("Cancel",role:.cancel){}}message:{Text("Choose a name you will recognize.")}
  .disabled(busy)
  }
 }
 func load()async{do{rows=try await api.rows("projects?select=*&order=created_at.desc&limit=100")}catch{api.message=error.localizedDescription}}
 func create(){guard !name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{return};busy=true;Task{defer{busy=false};do{try await api.insert("projects",values:["name":name]);name="";await load()}catch{api.message=error.localizedDescription}}}
}
struct SpacesView:View {
 @EnvironmentObject var api:Backend
 let project:Record
 @State private var rows:[Record]=[]
 @State private var adding=false
 @State private var name=""
 @State private var exterior=false
 var body:some View { List {
  ForEach(rows){row in NavigationLink{SpaceView(space:row)}label:{Label(row.text("name"),systemImage:row.text("environment")=="exterior" ? "leaf":"sofa")}}
  if rows.isEmpty { ContentUnavailableView("Add a space",systemImage:"square.dashed",description:Text("Start with a room or an outdoor area.")) }
 }.navigationTitle(project.text("name")).toolbar{Button("Add space",systemImage:"plus"){adding=true}}.task{await load()}.refreshable{await load()}
 .sheet(isPresented:$adding){NavigationStack{Form{TextField("Space name",text:$name);Toggle("Outdoor space",isOn:$exterior);Button("Create space"){Task{do{try await api.insert("spaces",values:["name":name,"project_id":project.id,"environment":exterior ? "exterior":"interior","kind":exterior ? "backyard":"living_room"]);name="";adding=false;await load()}catch{api.message=error.localizedDescription}}}.disabled(name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)}.navigationTitle("New space").toolbar{Button("Cancel"){adding=false}}}}
 }
 func load()async{do{rows=try await api.rows("spaces?project_id=eq.\(project.id)&select=*&order=created_at&limit=100")}catch{api.message=error.localizedDescription}}
}
private enum CaptureSheet:String,Identifiable {case floor,room,photo,library,manual;var id:String{rawValue}}
struct SpaceView:View {
 @EnvironmentObject var api:Backend
 let space:Record
 @State private var scans:[Record]=[]
 @State private var media:[Record]=[]
 @State private var sheet:CaptureSheet?
 @State private var preview:MediaPreview?
 @State private var deleting:Record?
 @State private var style="modern"
 @State private var notes=""
 @State private var busy=false
 private let styles=["modern","contemporary","scandinavian","japandi","traditional","coastal","mid_century","industrial","bohemian","custom"]
 var body:some View { List {
  Section("Capture your space") {
   if ARWorldTrackingConfiguration.isSupported {Button("Measure floor corners",systemImage:"viewfinder"){sheet = .floor}}
   if RoomCaptureSession.isSupported && space.text("environment")=="interior" {Button("Scan room in 3D",systemImage:"cube.transparent"){sheet = .room}}
   Button("Enter reference measurements",systemImage:"ruler"){sheet = .manual}
   Button("Take a photo or short video",systemImage:"camera"){sheet = .photo}
   Button("Import photo or video",systemImage:"photo.on.rectangle"){sheet = .library}
   Text("Capture estimates need checking before buying furniture. Bright, textured, level floors work best.").font(.footnote).foregroundStyle(.secondary)
  }
  Section("Saved captures") {
   if scans.isEmpty {Text("No floor outlines yet.").foregroundStyle(.secondary)}
   ForEach(scans){scan in VStack(alignment:.leading){Text(String(format:"%.2f m² estimated floor",scan.number("floor_area_m2")));Text("Needs measurement verification").font(.caption).foregroundStyle(.secondary)}}
   ForEach(media){asset in
    Button {perform{preview=MediaPreview(id:asset.id,url:try await api.mediaURL(asset),mime:asset.text("mime_type"))}} label:{Label(asset.text("mime_type").hasPrefix("video") ? "Video" : asset.text("mime_type")=="application/json" ? "3D room data":"Photo",systemImage:"doc").badge(asset.text("status")=="ready" ? "Saved":"Upload pending")}
    .disabled(asset.text("status") != "ready" || asset.text("mime_type")=="application/json")
    .swipeActions{if asset.text("status")=="ready"{Button("Delete",role:.destructive){deleting=asset}}}
   }
  }
  Section("Your design direction") {
   Picker("Style",selection:$style){ForEach(styles,id:\.self){Text($0.replacingOccurrences(of:"_",with:" ").capitalized).tag($0)}}
   TextField("Colors, mood, items to keep…",text:$notes,axis:.vertical).lineLimit(3...6)
   Button("Save design brief"){perform{try await api.insert("design_briefs",values:["space_id":space.id,"style":style,"instructions":notes]);api.message="Design brief saved."}}
   Text("AI rendering and shopping will be added in a later beta.").font(.footnote).foregroundStyle(.secondary)
  }
 }.navigationTitle(space.text("name")).disabled(busy).overlay{if busy{ProgressView("Saving…").padding().background(.regularMaterial,in:RoundedRectangle(cornerRadius:12))}}
 .task{await load()}.refreshable{await load()}
 .sheet(item:$preview){item in MediaPreviewView(item:item)}
 .confirmationDialog("Delete this media?",isPresented:Binding(get:{deleting != nil},set:{if !$0{deleting=nil}}),titleVisibility:.visible){Button("Delete",role:.destructive){if let asset=deleting{deleting=nil;perform{try await api.deleteMedia(asset)}}}}
 .fullScreenCover(item:$sheet,onDismiss:{Task{await load()}}){selection in
  switch selection {
  case .floor: GuidedScan { points in sheet=nil;perform{try await api.saveFloor(points:points,route:"arkit_guided",spaceID:space.id)} }
  case .room: RoomScan { data in sheet=nil;perform{try await api.upload(data,mime:"application/json",spaceID:space.id)} }
  case .manual: ReferenceMeasurements {points,ceiling in sheet=nil;perform{try await api.saveFloor(points:points,route:"reference_measurement",spaceID:space.id,ceiling:ceiling)}}
  case .photo,.library: MediaPicker(camera:selection == .photo){data,mime in sheet=nil;perform{try await api.upload(data,mime:mime,spaceID:space.id)}}
  }
 }
 }
 func perform(_ action:@escaping ()async throws->Void){busy=true;Task{defer{busy=false};do{try await action();await load()}catch{api.message=error.localizedDescription}}}
 func load()async{do{scans=try await api.rows("captures?space_id=eq.\(space.id)&select=*&order=created_at.desc&limit=100");media=try await api.rows("media?space_id=eq.\(space.id)&select=*&order=created_at.desc&limit=100");let briefs=try await api.rows("design_briefs?space_id=eq.\(space.id)&select=*&order=created_at.desc&limit=1");if let brief=briefs.first{style=brief.text("style");notes=brief.text("instructions")}}catch{api.message=error.localizedDescription}}
}

struct MediaPreview:Identifiable {let id:String;let url:URL;let mime:String}
struct MediaPreviewView:View {
 @Environment(\.dismiss) var dismiss
 let item:MediaPreview
 var body:some View {NavigationStack{Group{if item.mime.hasPrefix("video"){VideoPlayer(player:AVPlayer(url:item.url))}else{AsyncImage(url:item.url){phase in switch phase{case .success(let image):image.resizable().scaledToFit();case .failure:ContentUnavailableView("Preview expired",systemImage:"photo",description:Text("Close and reopen this photo."));default:ProgressView()}}}}.navigationTitle("Your media").toolbar{Button("Done"){dismiss()}}}}
}

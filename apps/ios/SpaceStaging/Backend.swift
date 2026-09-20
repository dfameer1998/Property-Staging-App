import Foundation
import SwiftUI

struct Record: Identifiable {
 let data: [String: Any]
 var id: String { data["id"] as? String ?? "" }
 func text(_ key: String) -> String { data[key] as? String ?? "" }
 func number(_ key: String) -> Double { data[key] as? Double ?? 0 }
}
struct AppFailure: LocalizedError { let message: String; var errorDescription: String? { message } }
@MainActor final class Backend: ObservableObject {
 @Published var signedIn = false
 @Published var message: String?
 private var token = "", refreshToken = "", userID = ""
 private var expiresAt = Date.distantPast
 private var refreshTask: Task<Void, Error>?
 func authenticate(email: String, password: String, create: Bool) async throws {
  let result = try await request(create ? "/auth/v1/signup" : "/auth/v1/token?grant_type=password", method: "POST", json: ["email":email.trimmingCharacters(in:.whitespacesAndNewlines),"password":password], authenticated: false)
  guard let session = result as? [String:Any], session["access_token"] != nil else { message="Check your email to confirm your account, then sign in."; return }
  accept(session)
 }
 private func accept(_ result: [String:Any]) {
  token=result["access_token"] as? String ?? ""; refreshToken=result["refresh_token"] as? String ?? ""
  userID=(result["user"] as? [String:Any])?["id"] as? String ?? ""
  expiresAt=Date().addingTimeInterval(result["expires_in"] as? Double ?? 3600); signedIn = !token.isEmpty
 }
 func signOut() async {
  _ = try? await request("/auth/v1/logout?scope=local",method:"POST")
  token=""; refreshToken=""; userID=""; signedIn=false
 }
 private func refreshIfNeeded() async throws {
  if expiresAt.timeIntervalSinceNow > 60 { return }
  if let existing=refreshTask { try await existing.value; return }
  let task=Task { @MainActor in
   guard !refreshToken.isEmpty else { throw AppFailure(message:"Please sign in again.") }
   let result=try await request("/auth/v1/token?grant_type=refresh_token",method:"POST",json:["refresh_token":refreshToken],authenticated:false)
   guard let session=result as? [String:Any] else { throw AppFailure(message:"Please sign in again.") }; accept(session)
  }
  refreshTask=task; defer { refreshTask=nil }; try await task.value
 }
 @discardableResult func request(_ path:String, method:String="GET", json:[String:Any]?=nil, bytes:Data?=nil, mime:String="application/json", authenticated:Bool=true) async throws -> Any {
  if authenticated { try await refreshIfNeeded() }
  var req=URLRequest(url:URL(string:BackendConfig.url+path)!)
  req.httpMethod=method; req.timeoutInterval=60
  req.setValue(BackendConfig.publishableKey,forHTTPHeaderField:"apikey")
  if authenticated { req.setValue("Bearer "+token,forHTTPHeaderField:"Authorization") }
  req.setValue(mime,forHTTPHeaderField:"Content-Type")
  req.setValue("return=representation",forHTTPHeaderField:"Prefer")
  if let json { req.httpBody=try JSONSerialization.data(withJSONObject:json) } else { req.httpBody=bytes }
  if let data=req.httpBody { req.setValue(String(data.count),forHTTPHeaderField:"Content-Length") }
  let (data,response)=try await URLSession.shared.data(for:req)
  let value=(try? JSONSerialization.jsonObject(with:data)) ?? [:]
  guard let http=response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
   let error=value as? [String:Any]
   throw AppFailure(message:(error?["msg"] ?? error?["message"] ?? error?["error_description"] ?? error?["error"]) as? String ?? "Request failed. Please retry.")
  }
  return value
 }
 func rows(_ path:String) async throws -> [Record] {
  let value=try await request("/rest/v1/"+path)
  return (value as? [[String:Any]] ?? []).map{Record(data:$0)}
 }
 func insert(_ table:String, values:[String:Any]) async throws {
  try await request("/rest/v1/"+table,method:"POST",json:values)
 }
 func upload(_ data:Data, mime:String, spaceID:String) async throws {
  guard data.count>0 && data.count<=10*1024*1024 else {throw AppFailure(message:"Use a photo or short video under 10 MB for this beta.")}
  let id=UUID().uuidString.lowercased(), path=userID+"/"+spaceID+"/"+id
  try await insert("media",values:["id":id,"space_id":spaceID,"object_path":path,"mime_type":mime,"byte_size":data.count])
  try await request("/storage/v1/object/space-media/"+path,method:"POST",bytes:data,mime:mime)
  try await request("/rest/v1/media?id=eq."+id,method:"PATCH",json:["status":"ready"])
 }
 func mediaURL(_ asset:Record) async throws -> URL {
  let result=try await request("/storage/v1/object/sign/space-media/"+asset.text("object_path"),method:"POST",json:["expiresIn":120]) as? [String:Any]
  guard let path=result?["signedURL"] as? String, path.hasPrefix("/object/sign/"), let url=URL(string:BackendConfig.url+"/storage/v1"+path) else {throw AppFailure(message:"Could not open this media.")}
  return url
 }
 func deleteMedia(_ asset:Record) async throws {
  try await request("/storage/v1/object/space-media",method:"DELETE",json:["prefixes":[asset.text("object_path")]])
  try await request("/rest/v1/media?id=eq."+asset.id,method:"DELETE")
 }
 func saveFloor(points:[[Double]], route:String, spaceID:String, ceiling:Double?=nil) async throws {
  var payload:[String:Any] = ["id":UUID().uuidString.lowercased(),"spaceId":spaceID,"schemaVersion":1,"platform":"ios","route":route,"unit":"m","coordinateSystem":"right_handed_y_up","floorPoints":points]
  if let ceiling { payload["ceilingHeightM"]=ceiling }
  try await request("/functions/v1/capture",method:"POST",json:payload)
 }
}

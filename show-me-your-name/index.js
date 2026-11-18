(() => {
 const {findByName,findByStoreName}=vendetta.metro;
 const {ReactNative}=vendetta.metro.common;
 const un=[];
 let users;
 function process(row){
  if(!row?.message||(row.type!=null&&row.type!==1))return;
  const m=row.message;
  const id=m.authorId??m.author?.id;
  if(id==null||typeof m.username!=='string')return;
  const user=users.getUser(String(id));
  const username=user?.username;
  if(!username||m.username===username||m.username.endsWith(' (@'+username+')'))return;
  // Only the serialized chat-row label is changed. User/guild stores are untouched.
  m.username=m.username+' (@'+username+')';
 }
 return {
  onLoad(){
   users=findByStoreName('UserStore');
   if(!users?.getUser)throw Error('UserStore is unavailable on this Discord version');
   const chat=ReactNative.NativeModules.DCDChatManager;
   if(chat?.updateRows){
    un.push(vendetta.patcher.before('updateRows',chat,args=>{
     if(typeof args[1]!=='string')return;
     try{const rows=JSON.parse(args[1]);if(!Array.isArray(rows))return;rows.forEach(process);args[1]=JSON.stringify(rows);}catch(e){console.warn('[ShowMeYourName]',e);}
    }));
   }else{
    const RowManager=findByName('RowManager');
    if(!RowManager?.prototype?.generate)throw Error('Unsupported chat renderer');
    un.push(vendetta.patcher.after('generate',RowManager.prototype,(_args,row)=>{process(row);}));
   }
  },
  onUnload(){un.splice(0).forEach(f=>f());}
 };
})()

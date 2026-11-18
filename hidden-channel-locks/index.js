(()=>{ /* HiddenChannelLocks 1.1.1 - MIT. Original implementation. */
/* Original MIT implementation. Additive only: never mutates, drops or replaces Discord data or list models. */
function createHiddenChannelLocksCore() {
    const TYPE = {0:'text',2:'voice',4:'category',5:'announcement',13:'stage',14:'directory',15:'forum',16:'media',17:'lobby'};
    function bits(value) { try { return BigInt(value?.bitfield ?? value ?? 0); } catch { return 0n; } }
    const obfuscated = c => (bits(c?.flags) & 131072n) !== 0n;
    const typeName = c => TYPE[Number(c?.type)] || 'unknown';
    const realName = c => typeof c?.name === 'string' && c.name.trim() && !['___hidden___','no access','hidden channel'].includes(c.name.trim().toLowerCase()) ? c.name : null;
    const label = c => '🔒 ' + (realName(c) || ('Hidden ' + typeName(c) + (Number(c?.type) === 4 ? '' : ' channel')));
    function compareId(a,b) { a=String(a); b=String(b); return a.length-b.length || (a<b?-1:a>b?1:0); }
    function compare(a,b) { return (Number(a?.position)||0)-(Number(b?.position)||0) || compareId(a?.id,b?.id); }
    function values(o) { return o instanceof Map ? Array.from(o.values()) : Object.values(o || {}); }
    function clone(o, extra={}) {
        if (!o || typeof o !== 'object') throw Error('Unsupported UI object');
        const x=Object.create(Object.getPrototypeOf(o));
        for (const key of Reflect.ownKeys(o)) {
            const d=Object.getOwnPropertyDescriptor(o,key);
            // Clone descriptors but leave our UI copy writable/configurable, even if source is frozen.
            if ('value' in d) Object.defineProperty(x,key,{...d,writable:true,configurable:true});
            else Object.defineProperty(x,key,{...d,configurable:true});
        }
        for (const [k,v] of Object.entries(extra)) Object.defineProperty(x,k,{value:v,writable:true,enumerable:true,configurable:true});
        return x;
    }
    function isCandidate(c, permissionCan) {
        if (!c?.guild_id || [1,3,4,10,11,12].includes(Number(c.type))) return false;
        if (obfuscated(c)) return true;
        try { return permissionCan(c) === false; } catch { return false; }
    }
    function info(c, getChannel=()=>null, resolveRole=id=>id, resolveUser=id=>id) {
        const parent=c.parent_id == null ? null : getChannel(String(c.parent_id));
        const lines=[
            'Discord withholds hidden-channel names, topics and messages. This plugin only displays metadata already delivered to this client; it cannot recover withheld data.',
            '', 'Type: '+typeName(c)+' ('+c.type+')',
            'Category: '+(c.parent_id == null ? 'No category' : (realName(parent)||'Name withheld/unavailable')+' ['+c.parent_id+']'),
            'Position: '+(c.position ?? 'Unavailable'), 'Channel ID: '+c.id,
            'Name received: '+(realName(c)||'Withheld / no real name received'),
            'Topic received: '+(typeof c.topic === 'string' ? (c.topic || '(empty)') : 'Withheld / not supplied'),
            'Obfuscated flag: '+(obfuscated(c)?'Yes':'No')
        ];
        const overwrites=values(c.permissionOverwrites ?? c.permission_overwrites);
        lines.push('', 'Permission data received:');
        if (obfuscated(c)) lines.push('WARNING: Discord may replace the real overwrites with a synthetic @everyone deny. The following is received data, NOT a reliable list of who can access this channel.');
        else lines.push('Explicit VIEW_CHANNEL overrides only. Role combinations, owner and Administrator can change effective access; this is not a complete member list.');
        if (!overwrites.length) lines.push('No overwrites supplied.');
        for (const ow of overwrites) {
            if (!ow || ow.id == null) continue;
            const id=String(ow.id), role=Number(ow.type)===0;
            const who=id===String(c.guild_id)?'@everyone':role?'Role '+resolveRole(id):'User '+resolveUser(id);
            const allow=bits(ow.allow),deny=bits(ow.deny);
            lines.push(who+' ['+id+']: '+((allow&1024n)!==0n?'explicit allow':(deny&1024n)!==0n?'explicit deny':'no VIEW_CHANNEL override')+'; allow='+allow+' deny='+deny);
        }
        return lines.join('\n');
    }
    // Additive merge: every original ID kept in original order; hidden IDs inserted by raw position.
    function mergeShown(orig, extra, recordOf) {
        if (!Array.isArray(orig) || !extra.length) return orig;
        const seen=new Set(orig.map(String));
        const add=extra.filter(id=>!seen.has(String(id))).sort((a,b)=>compare(recordOf(a),recordOf(b)));
        if (!add.length) return orig;
        const out=[];let k=0;
        for (const id of orig) {
            const r=recordOf(id);
            while (k<add.length && r && compare(recordOf(add[k]),r)<0) out.push(add[k++]);
            out.push(id);
        }
        while (k<add.length) out.push(add[k++]);
        return isSupersetInOrder(orig,out) ? out : orig;
    }
    function isSupersetInOrder(orig, out) {
        if (!Array.isArray(out) || out.length<orig.length) return false;
        let k=0;for (const id of out) if (k<orig.length && id===orig[k]) k++;
        return k===orig.length;
    }
    return {bits,obfuscated,typeName,realName,label,compareId,compare,values,clone,isCandidate,info,mergeShown,isSupersetInOrder};
}

const C=createHiddenChannelLocksCore();
const V=vendetta, {React:R,ReactNative:N}=V.metro.common;
const storage=V.plugin.storage;
const VERSION='1.1.1';
const CANNOT_SHOW=1, SHOW=4; // verified enum values in Discord 354.12
const diag={version:VERSION,showHidden:null,active:false,tripped:null,modules:{},added:0,checks:0,events:[]};
const unpatch=[],timers=[];let alive=false,voiceSafe=false,S={},installed=false;
const models=new Map();               // guildId -> last seen list model (for refresh only)
let shownCache=new WeakMap(), wrapCache=new WeakMap(), verified=new WeakSet(), bypass=false;
const LEGACY='https://marcmy.github.io/revenge-plugins/ShowHiddenChannels/';
const KEY='discord-plus-hidden-channel-info', GUARD='__discordPlusHiddenChannelLocks';
function log(event,detail='') {
    const entry={event,detail:String(detail).slice(0,300)};diag.events.push(entry);if(diag.events.length>25)diag.events.shift();
    try{console.log('[HiddenChannelLocks]',event,entry.detail);}catch{}
}
function findProps(...p) {try{return V.metro.findByProps(...p);}catch{return null;}}
function findStore(n) {try{return V.metro.findByStoreName(n);}catch{return null;}}
function can(c) {try{return S.permissions.can(S.view,c);}catch{return undefined;}}
function hidden(c) {return C.isCandidate(c,can);}
function allowType(c) {return voiceSafe||![2,13].includes(Number(c?.type));}
function active() {return alive&&diag.active&&!diag.tripped&&storage.showHidden!==false;}
function originalChannel(id) {try{return S.channels?.getChannel(String(id));}catch{return null;}}
function roleName(id,gid) {try{const roles=S.roles?.getRoles?.(gid)||S.guilds?.getGuild?.(gid)?.roles;return roles?.[id]?.name||C.values(roles).find(r=>String(r.id)===id)?.name||id;}catch{return id;}}
function userName(id) {try{const u=S.users?.getUser?.(id);return u?.username?'@'+u.username:id;}catch{return id;}}
function openInfo(c) {
    if(!c)return;
    const body=C.info(c,originalChannel,id=>roleName(id,c.guild_id),userName),title=C.label(c);
    try {
        const sheets=globalThis.bunny?.ui?.sheets,Sheet=findProps('ActionSheet')?.ActionSheet;
        if(sheets?.showSheet&&Sheet) {
            const Info=()=>R.createElement(Sheet,null,R.createElement(N.View,{style:{padding:18}},
                R.createElement(N.Text,{style:{color:'#f2f3f5',fontSize:21,fontWeight:'700',marginBottom:12}},title),
                R.createElement(N.ScrollView,{style:{maxHeight:Math.min(600,N.Dimensions.get('window').height*0.65)}},R.createElement(N.Text,{selectable:true,style:{color:'#dbdee1',fontSize:15,lineHeight:22}},body)),
                R.createElement(N.Pressable,{onPress:()=>sheets.hideSheet(KEY),style:{padding:12,backgroundColor:'#5865f2',borderRadius:8,marginTop:14}},R.createElement(N.Text,{style:{color:'white',textAlign:'center'}},'Close'))));
            sheets.showSheet(KEY,Info);return;
        }
    }catch(e){log('sheet-fallback',e?.message||e);}
    try{N.Alert.alert(title,body,[{text:'Close'}]);}catch(e){log('info-unavailable',e?.message||e);}
}
function getHiddenArg(args) {
    for(const a of args) {
        const ids=typeof a==='string'?[a]:(a&&typeof a==='object'?[a.channelId,a.channel_id,a.channel?.id,a.id]:[]);
        for(const id of ids){if(id==null)continue;const c=originalChannel(id);if(hidden(c))return c;}
    }
    return null;
}
function guard(obj,method,mode='info') {
    if(typeof obj?.[method]!=='function')return false;
    unpatch.push(V.patcher.instead(method,obj,(args,orig)=>{
        let c=null;try{c=active()?getHiddenArg(args):null;}catch{}
        if(c){if(mode==='info')openInfo(c);return;}
        return orig(...args);
    }));log('hook',method);return true;
}
// ---- Additive list hooks (prototype level, results only; Discord's objects are never written) ----
function trip(reason,model) {
    if(diag.tripped)return;diag.tripped=reason;log('self-check-disabled',reason);
    refresh(model);
}
function refresh(extra) {
    shownCache=new WeakMap();wrapCache=new WeakMap();verified=new WeakSet();
    // invalidate() is Discord's own cache reset (clears derived rows, bumps version); no data changes.
    for(const m of new Set([...models.values(),extra].filter(Boolean))){try{m.invalidate();}catch(e){log('invalidate-error',e?.message||e);}}
    try{S.list?.emitChange?.();}catch(e){log('refresh-error',e?.message||e);}
}
function isCanonical(cat) {
    const g=cat?.guild;if(!g||cat.isCollapsed)return false;
    return cat===g.noParentCategory||(cat.record&&g.categories&&g.categories[cat.id]===cat);
}
function onShown(args,orig) {
    if(bypass||!active()||!Array.isArray(orig))return;
    try {
        if(!isCanonical(this))return;
        const hit=shownCache.get(this);if(hit&&hit.orig===orig)return hit.out;
        const rows=this.channels||{},extra=[];
        for(const id of Object.keys(rows)){const row=rows[id],rec=row?.record;
            if(row&&row.renderLevel===CANNOT_SHOW&&rec&&String(rec.id)===id&&hidden(rec)&&allowType(rec))extra.push(id);}
        const out=extra.length?C.mergeShown(orig,extra,id=>rows[id]?.record):orig;
        if(out!==orig&&!C.isSupersetInOrder(orig,out)){trip('shown-not-superset');return;}
        shownCache.set(this,{orig,out});
        if(out!==orig)diag.added=out.length-orig.length;
        return out===orig?undefined:out;
    }catch(e){log('shown-error',e?.message||e);return;}
}
function onRows(args,ret) {
    if(bypass||!active()||!Array.isArray(ret)||verified.has(ret))return;
    try {
        diag.checks++;
        // Self-check: compare against Discord's unmodified per-section rows.
        bypass=true;let base;
        try{
            const cats=[this.channelNoticeSection,this.guildActionSection,this.favoritesCategory,this.recentsCategory,this.noParentCategory,...(this.sortedNamedCategories||[]),this.voiceChannelsCategory];
            base=cats.map(c=>{try{return c&&typeof c.getRows==='function'?c.getRows():null;}catch{return null;}});
        }finally{bypass=false;}
        const total=a=>a.reduce((n,x)=>n+(Array.isArray(x)?x.length:0),0);
        const ok=ret.length===base.length&&ret.every((sec,i)=>!Array.isArray(base[i])||(Array.isArray(sec)&&C.isSupersetInOrder(base[i],sec)))&&total(ret)>=total(base);
        if(!ok){trip('row-count-or-order-check-failed',this);return;}
        verified.add(ret);
    }catch(e){trip('row-check-error: '+(e?.message||e),this);}
}
function onSectionRow(args,ret) {
    if(!active()||!ret?.channel)return;
    try {
        const row=ret.channel,rec=row.record;
        if(row.renderLevel!==CANNOT_SHOW||!hidden(rec))return;
        let w=wrapCache.get(row);
        if(!w||w.src!==rec){
            // Display-only wrapper: inherits everything from Discord's row, overrides label/visibility.
            const view=Object.create(row);
            Object.defineProperty(view,'record',{value:C.clone(rec,{name:C.label(rec)}),enumerable:true,configurable:true,writable:true});
            Object.defineProperty(view,'renderLevel',{value:SHOW,enumerable:true,configurable:true,writable:true});
            w={src:rec,view};wrapCache.set(row,w);
        }
        return {...ret,channel:w.view};
    }catch(e){log('row-wrap-error',e?.message||e);return;}
}
function installListHooks(model) {
    if(installed||!model)return;
    try {
        const implProto=Object.getPrototypeOf(model);
        let catProto=model.noParentCategory&&Object.getPrototypeOf(model.noParentCategory);
        while(catProto&&!(Object.prototype.hasOwnProperty.call(catProto,'getShownChannelIds')&&Object.prototype.hasOwnProperty.call(catProto,'getRows')))catProto=Object.getPrototypeOf(catProto);
        const ok=implProto&&catProto&&['getRows','getChannelFromSectionRow','invalidate'].every(k=>typeof implProto[k]==='function')&&typeof catProto.getShownChannelIds==='function'
            &&model.categories&&typeof model.categories==='object'&&model.noParentCategory?.channels;
        if(!ok){log('list-shape-unsupported');return;}
        installed=true;
        unpatch.push(V.patcher.after('getShownChannelIds',catProto,onShown));
        unpatch.push(V.patcher.after('getRows',implProto,onRows));
        unpatch.push(V.patcher.after('getChannelFromSectionRow',implProto,onSectionRow));
        log('list-hooks','additive hooks installed');refresh(model);
    }catch(e){log('list-hook-failure',e?.message||e);}
}
function onGetGuild(args,ret) {
    // Never changes the returned value; only notes the model and installs hooks once.
    try{const m=ret?.guildChannels;if(m&&args[0]!=null){models.set(String(args[0]),m);if(!installed&&diag.active)installListHooks(m);}}catch{}
}
function installHooks() {
    if(!alive||diag.active)return true;
    if(globalThis[GUARD]&&globalThis[GUARD]!==instanceId){log('inactive-duplicate-instance');return false;}
    S.channels=findStore('ChannelStore')||findProps('getChannel','getMutableGuildChannelsForGuild');
    S.list=findStore('ChannelListStore')||findProps('getGuild','getGuildWithoutChangingGuildActionRows','recentsChannelCount');
    S.permissions=findStore('PermissionStore')||findProps('can','getChannelPermissions');
    S.view=V.metro.common.constants?.Permissions?.VIEW_CHANNEL ?? findProps('Permissions')?.Permissions?.VIEW_CHANNEL;
    S.guilds=findStore('GuildStore');S.roles=findStore('GuildRoleStore');S.users=findStore('UserStore');
    const nav=findProps('transitionToChannel'),voice=findProps('selectVoiceChannel'),modal=findProps('openGuildVoiceModal');
    diag.modules={channelStore:typeof S.channels?.getChannel==='function',listStore:typeof S.list?.getGuild==='function',permissionStore:typeof S.permissions?.can==='function',viewPermission:S.view!=null,textNavigation:typeof nav?.transitionToChannel==='function'};
    if(Object.values(diag.modules).some(v=>!v)){log('inactive-missing-modules',JSON.stringify(diag.modules));return false;}
    try {
        globalThis[GUARD]=instanceId;
        try{const old=V.plugins?.plugins?.[LEGACY];if(old?.enabled){V.plugins.stopPlugin(LEGACY,true);log('legacy-disabled','ShowHiddenChannels');}}catch(e){log('legacy-stop-failed',e?.message||e);}
        guard(nav,'transitionToChannel');guard(nav,'transitionToThread');guard(nav,'transitionToMessage');
        voiceSafe=guard(voice,'selectVoiceChannel')&&guard(modal,'openGuildVoiceModal');guard(modal,'navigateToVoiceChannel');
        guard(findProps('openStageChannel'),'openStageChannel');diag.voiceRows=voiceSafe;
        if(!voiceSafe)log('voice-rows-disabled','voice guards unavailable');
        for(const m of ['getGuild','getGuildWithoutChangingGuildActionRows'])if(typeof S.list[m]==='function')unpatch.push(V.patcher.after(m,S.list,onGetGuild));
        diag.active=true;log('active','additive mode; no store, gateway or HTTP changes');
        try{S.list.emitChange?.();}catch{}
        return true;
    }catch(e){teardown();log('inactive-hook-failure',e?.message||e);return false;}
}
function teardown(){while(unpatch.length){try{unpatch.pop()();}catch{}}installed=false;diag.active=false;if(globalThis[GUARD]===instanceId)delete globalThis[GUARD];}
const instanceId={};
function switchRow(value,onChange) {
    // Prefer Discord's own form switch (correct on/off styling); explicit colours on the RN fallback.
    try{const Row=V.ui?.components?.Forms?.FormSwitchRow;
        if(typeof Row==='function'||typeof Row==='object')return R.createElement(Row,{label:'Show hidden-channel locks',subLabel:value?'On':'Off',value:!!value,onValueChange:onChange});}catch{}
    return R.createElement(N.View,{style:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}},
        R.createElement(N.Text,{style:{color:'#dbdee1',fontSize:15}},'Show hidden-channel locks'),
        R.createElement(N.Switch,{value:!!value,onValueChange:onChange,trackColor:{false:'#4e5058',true:'#5865f2'},thumbColor:'#ffffff'}));
}
function Settings() {
    const [show,setShow]=R.useState(()=>{try{return storage.showHidden!==false;}catch{return true;}}),[n,repaint]=R.useState(0);
    const text=(s,size=15)=>R.createElement(N.Text,{style:{color:'#dbdee1',fontSize:size,marginBottom:10}},s);
    return R.createElement(N.ScrollView,{style:{flex:1,backgroundColor:'#202225'},contentContainerStyle:{padding:18}},
        text('HiddenChannelLocks '+VERSION,23),text('Adds lock rows for hidden channels to the server channel list. Discord withholds names and messages; real names are shown only if this client actually received them.'),
        switchRow(show,x=>{try{storage.showHidden=x;}catch(e){log('storage-write-error',e?.message||e);}setShow(x);refresh();repaint(n+1);}),
        text('Locks are '+(show?'ON':'OFF')+' (saved setting: '+(storage.showHidden===false?'off':'on')+')'),
        R.createElement(N.Pressable,{onPress:()=>{diag.tripped=null;installHooks();refresh();repaint(n+1);},style:{padding:12,backgroundColor:'#5865f2',borderRadius:8,marginVertical:16}},text('Re-check / refresh list')),
        (diag.showHidden=storage.showHidden!==false,null),
        text('Status: '+(diag.tripped?'Disabled by self-check ('+diag.tripped+')':diag.active?'Active':'Inactive')),
        text(JSON.stringify(diag,null,2),12));
}
return {
    onLoad(){alive=true;try{storage.showHidden??=true;}catch{}log('load','Discord 354.12 / classic Revenge');
        try{installHooks();}catch(e){log('load-error',e?.message||e);}
        for(const ms of [1500,5000,12000])timers.push(setTimeout(()=>{try{if(alive&&!diag.active)installHooks();}catch{}},ms));
        try{const undo=globalThis.bunny?.ui?.settings?.registerSection?.({name:'Discord+ · channel locks',items:[{key:'HIDDEN_CHANNEL_LOCKS',title:()=> 'Hidden channel locks',render:async()=>({default:Settings})}]});if(undo)unpatch.push(undo);}catch(e){log('settings-link-fallback',e?.message||e);}
    },
    onUnload(){alive=false;timers.splice(0).forEach(clearTimeout);teardown();try{refresh();}catch{}log('unloaded');},
    settings:Settings
};

})()

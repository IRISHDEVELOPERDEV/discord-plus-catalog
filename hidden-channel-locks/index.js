(()=>{ /* HiddenChannelLocks 1.0.0 - MIT. Original implementation. */
/* Original MIT implementation. Only projects UI models; never changes permission or channel stores. */
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
    // Build an isolated, prototype-preserving view of Discord 354's ChannelListImpl.
    // All categories/rows are copied so Discord's getRows() can update UI positions safely.
    function project(model, opt) {
        if (!model || !model.noParentCategory || !model.categories || typeof model.getRows!=='function') throw Error('Unsupported ChannelListImpl shape');
        const out=clone(model), oldToNew=new Map(), rawItems=new Map(), allCats=[];
        const named=values(model.categories);
        const special=['favoritesCategory','recentsCategory','noParentCategory','voiceChannelsCategory'];
        for (const cat of [...named,...special.map(k=>model[k])]) if (cat && !oldToNew.has(cat)) {
            if (typeof cat.getRows!=='function' || typeof cat.getShownChannelIds!=='function' || !cat.channels || typeof cat.channels!=='object') throw Error('Unsupported category shape');
            const copy=clone(cat,{guild:out,channels:{},shownChannelIds:null});oldToNew.set(cat,copy);allCats.push(copy);
            for (const [id,row] of Object.entries(cat.channels)) {
                if (!row || !row.record) continue;
                rawItems.set(String(id),row);
                copy.channels[id]=clone(row,{category:copy});
            }
        }
        out.categories={};
        for (const [id,cat] of Object.entries(model.categories)) out.categories[id]=oldToNew.get(cat);
        for (const key of special) if (model[key]) out[key]=oldToNew.get(model[key]);
        const canonical=new Set([out.noParentCategory,...values(out.categories)]);
        const records=new Map();
        for (const row of rawItems.values()) records.set(String(row.record.id),row.record);
        for (const c of opt.channels || []) if (c?.id != null) records.set(String(c.id),c);
        let added=0,skipped=0;
        for (const c of records.values()) {
            if (!opt.hidden(c) || !opt.allowType(c)) continue;
            const id=String(c.id),parent=c.parent_id == null ? null : String(c.parent_id);
            let target=parent == null ? out.noParentCategory : out.categories[parent];
            if (!target && parent != null) {
                const record=records.get(parent) || opt.getChannel(parent);
                const template=values(out.categories)[0] || out.noParentCategory;
                if (Number(record?.type)!==4 || !template) { skipped++;opt.warn('parent-unavailable');continue; }
                target=clone(template,{id:parent,record:clone(record,{name:realName(record)||'🔒 Hidden category'}),guild:out,channels:{},shownChannelIds:null,isCollapsed:false});
                out.categories[parent]=target;allCats.push(target);canonical.add(target);
            }
            if (!target) {skipped++;continue;}
            // Existing type-specific row prototype is preferable, but the native row interface
            // has a safe minimal form when Discord omitted this channel from its UI model.
            const template=rawItems.get(id) || Array.from(rawItems.values()).find(r=>Number(r.record.type)===Number(c.type));
            const base=template || {id,category:target,record:c,threadIds:[],threadCount:0,renderLevel:1,position:0,subtitle:null,isMuted:true,isCollapsed:false,isFirstVoiceChannel:false};
            const display=clone(c,{name:label(c)});
            const row=clone(base,{id,category:target,record:display,renderLevel:target.isCollapsed?3:4,threadIds:[],threadCount:0,subtitle:null});
            // A hidden channel must appear only in its real category, never Favorites/Recents.
            for (const cat of allCats) delete cat.channels[id];
            target.channels[id]=row;added++;
        }
        if (!added) return {model:null,added,skipped};
        for (const cat of allCats) {
            const isCanonical=canonical.has(cat);
            if (cat.record && Number(cat.record.type)===4 && opt.hiddenCategory(cat.record)) cat.record=clone(cat.record,{name:realName(cat.record)||'🔒 Hidden category'});
            // Preserve Discord's existing visible selection; add only our canonical lock rows.
            const existing=cat.getShownChannelIds();
            const ids=new Set(Array.isArray(existing)?existing.map(String):[]);
            for (const id of ids) if (!cat.channels[id]) ids.delete(id);
            if (isCanonical && !cat.isCollapsed) for (const [id,row] of Object.entries(cat.channels)) if (opt.hidden(records.get(String(id)) || row.record) && opt.allowType(records.get(String(id)) || row.record)) ids.add(String(id));
            if (cat.isCollapsed) for (const id of ids) if (opt.hidden(records.get(id)||cat.channels[id]?.record)) ids.delete(id);
            const ordered=Array.from(ids).sort((a,b)=>compare(cat.channels[a].record,cat.channels[b].record));
            Object.defineProperty(cat,'getShownChannelIds',{value:()=>ordered.slice(),writable:true,configurable:true});
            cat.shownChannelIds=ordered;
        }
        out.rows=null;out.sections=null;out.sortedNamedCategories=null;out.firstVoiceChannel=undefined;
        out.version=(Number(model.version)||0)+1000000+opt.revision;
        return {model:out,added,skipped};
    }
    return {bits,obfuscated,typeName,realName,label,compareId,compare,values,clone,isCandidate,info,project};
}

const C=createHiddenChannelLocksCore();
const V=vendetta, {React:R,ReactNative:N}=V.metro.common;
const storage=V.plugin.storage;
const diag={version:'1.0.0',active:false,modules:{},projections:0,lockRows:0,skipped:0,events:[]};
const unpatch=[],timers=[];let revision=1,cache=new WeakMap(),S={},alive=false,voiceSafe=false;
const LEGACY='https://marcmy.github.io/revenge-plugins/ShowHiddenChannels/';
const KEY='discord-plus-hidden-channel-info';
function log(event,detail='') {
    const entry={event,detail:String(detail).slice(0,300)};diag.events.push(entry);if(diag.events.length>20)diag.events.shift();
    console.log('[HiddenChannelLocks]',event,entry.detail);
}
function findProps(...p) {try{return V.metro.findByProps(...p);}catch{return null;}}
function findStore(n) {try{return V.metro.findByStoreName(n);}catch{return null;}}
function can(c) {try{return S.permissions.can(S.view,c);}catch{return undefined;}}
function hidden(c) {return C.isCandidate(c,can);}
function originalChannel(id) {try{return S.channels?.getChannel(String(id));}catch{return null;}}
function guildRecords(gid) {try{return C.values(S.channels.getMutableGuildChannelsForGuild(String(gid)));}catch{return [];}}
function roleName(id,gid) {
    try {const roles=S.roles?.getRoles?.(gid)||S.guilds?.getGuild?.(gid)?.roles;return roles?.[id]?.name || C.values(roles).find(r=>String(r.id)===id)?.name || id;}catch{return id;}
}
function userName(id) {try {const u=S.users?.getUser?.(id);return u?.username?'@'+u.username:id;}catch{return id;}}
function content(c) {return C.info(c,originalChannel,id=>roleName(id,c.guild_id),userName);}
function openInfo(c) {
    if(!c)return;
    const body=content(c),title=C.label(c);
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
    // Never fall through into navigation if the custom sheet is unavailable.
    try{N.Alert.alert(title,body,[{text:'Close'}]);}catch(e){log('info-unavailable',e?.message||e);}
}
function getHiddenArg(args) {
    for(const a of args) {
        const candidates=typeof a==='string'?[a]:(a&&typeof a==='object'?[a.channelId,a.channel_id,a.channel?.id,a.id]:[]);
        for(const id of candidates) {if(id==null)continue;const c=originalChannel(id);if(hidden(c))return c;}
    }
    return null;
}
function guard(obj,method,mode='info') {
    if(typeof obj?.[method]!=='function')return false;
    const undo=V.patcher.instead(method,obj,(args,orig)=>{
        const c=storage.showHidden!==false?getHiddenArg(args):null;
        if(c){if(mode==='info')openInfo(c);return;}
        return orig(...args);
    });unpatch.push(undo);log('hook',method);return true;
}
function invalidate() {revision++;cache=new WeakMap();try{S.list?.emitChange?.();}catch(e){log('refresh-error',e?.message||e);}}
function projection(args,result) {
    if(!alive||!diag.active||storage.showHidden===false)return result;
    const source=result?.guildChannels;
    if(!source)return result;
    try {
        const hit=cache.get(source);
        if(hit?.version===source.version&&hit.revision===revision)return hit.result;
        const p=C.project(source,{revision,channels:guildRecords(args[0]??source.id),getChannel:originalChannel,hidden,
            hiddenCategory:c=>C.obfuscated(c)||can(c)===false,
            allowType:c=>voiceSafe||![2,13].includes(Number(c.type)),warn:e=>log('row-skipped',e)});
        diag.projections++;diag.lockRows=p.added;diag.skipped=p.skipped;
        const out=p.model?{...result,guildChannels:p.model,guildChannelsVersion:p.model.version}:result;
        cache.set(source,{version:source.version,revision,result:out});
        log('projected','locks='+p.added+' skipped='+p.skipped);return out;
    }catch(e){
        // Returning Discord's original object prevents broken projection shapes from crashing it.
        log('projection-skipped',e?.message||e);cache.set(source,{version:source.version,revision,result});return result;
    }
}
function installHooks() {
    if(!alive||diag.active)return true;
    S.channels=findStore('ChannelStore')||findProps('getChannel','getMutableGuildChannelsForGuild');
    S.list=findStore('ChannelListStore')||findProps('getGuild','getGuildWithoutChangingGuildActionRows','recentsChannelCount');
    S.permissions=findStore('PermissionStore')||findProps('can','getChannelPermissions');
    S.view=V.metro.common.constants?.Permissions?.VIEW_CHANNEL ?? findProps('Permissions')?.Permissions?.VIEW_CHANNEL;
    S.guilds=findStore('GuildStore');S.roles=findStore('GuildRoleStore');S.users=findStore('UserStore');
    const nav=findProps('transitionToChannel'),voice=findProps('selectVoiceChannel'),modal=findProps('openGuildVoiceModal');
    diag.modules={channelStore:typeof S.channels?.getChannel==='function',listStore:typeof S.list?.getGuild==='function',permissionStore:typeof S.permissions?.can==='function',viewPermission:S.view!=null,textNavigation:typeof nav?.transitionToChannel==='function',infoFallback:typeof N.Alert?.alert==='function'};
    if(Object.values(diag.modules).some(v=>!v)){log('inactive-missing-modules',JSON.stringify(diag.modules));return false;}
    try {
        // Supersede the old plugin, whose gateway/permission patches are not needed for placeholders.
        const old=V.plugins?.plugins?.[LEGACY];
        if(old?.enabled){V.plugins.stopPlugin(LEGACY,true);log('legacy-disabled','ShowHiddenChannels');}
        guard(nav,'transitionToChannel');guard(nav,'transitionToThread');guard(nav,'transitionToMessage');
        const directVoice=guard(voice,'selectVoiceChannel');
        const modalVoice=guard(modal,'openGuildVoiceModal');guard(modal,'navigateToVoiceChannel');
        guard(findProps('openStageChannel'),'openStageChannel');
        voiceSafe=directVoice&&modalVoice;diag.voiceRows=voiceSafe;
        if(!voiceSafe)log('voice-rows-disabled','required voice navigation guards unavailable');
        const preload=findProps('preload','fetchChannelStoreListing');guard(preload,'preload','suppress');
        for(const method of ['getGuild','getGuildWithoutChangingGuildActionRows'])if(typeof S.list[method]==='function')unpatch.push(V.patcher.after(method,S.list,projection));
        diag.active=true;log('active','UI-only projection. No gateway, HTTP, permission or channel-store mutations.');invalidate();return true;
    }catch(e){while(unpatch.length){try{unpatch.pop()();}catch{}}diag.active=false;log('inactive-hook-failure',e?.message||e);return false;}
}
function Settings() {
    const [show,setShow]=R.useState(storage.showHidden!==false),[count,repaint]=R.useState(0);
    const text=(s,size=15)=>R.createElement(N.Text,{style:{color:'#dbdee1',fontSize:size,marginBottom:10}},s);
    return R.createElement(N.ScrollView,{style:{flex:1,backgroundColor:'#202225'},contentContainerStyle:{padding:18}},
        text('HiddenChannelLocks',23),text('Shows lock placeholders in the server channel list. Discord withholds names and messages; real names are shown only if this client actually received them.'),
        R.createElement(N.View,{style:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}},text('Show hidden-channel locks'),R.createElement(N.Switch,{value:show,onValueChange:x=>{storage.showHidden=x;setShow(x);invalidate();}})),
        R.createElement(N.Pressable,{onPress:()=>{installHooks();invalidate();repaint(count+1);},style:{padding:12,backgroundColor:'#5865f2',borderRadius:8,marginVertical:16}},text('Refresh list / diagnostics')),
        text('Status: '+(diag.active?'Active':'Inactive — unsupported or not-yet-loaded modules')),
        text(JSON.stringify(diag,null,2),12),text('If rows do not appear, switch to another server and back. A full app restart may be needed after updating plugins. No server metadata is requested or guessed.'));
}
return {
    onLoad(){alive=true;storage.showHidden??=true;log('load','Discord 354.12 / classic Revenge');installHooks();
        for(const ms of [1500,5000,12000])timers.push(setTimeout(()=>{if(alive&&!diag.active)installHooks();},ms));
        try{const undo=globalThis.bunny?.ui?.settings?.registerSection?.({name:'Discord+ · channel locks',items:[{key:'HIDDEN_CHANNEL_LOCKS',title:()=> 'Hidden channel locks',render:async()=>({default:Settings})}]});if(undo)unpatch.push(undo);}catch(e){log('settings-link-fallback',e?.message||e);}
    },
    onUnload(){alive=false;diag.active=false;timers.splice(0).forEach(clearTimeout);while(unpatch.length){try{unpatch.pop()();}catch{}}invalidate();log('unloaded');},
    settings:Settings
};

})()

const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
let checks=0;
const floors={'next':'16.4.1','next-auth':'4.24.15','@auth/core':'0.41.3','sharp':'0.35.5','@anthropic-ai/sdk':'0.91.1','postcss':'8.5.23'};
function atLeast(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return true;}
for(const [name,min]of Object.entries(floors)){
 const matches=Object.entries(lock.packages).filter(([key])=>key==='node_modules/'+name||key.endsWith('/node_modules/'+name));assert(matches.length,name+' must exist');
 for(const [key,value]of matches){assert(atLeast(value.version,min),key+' is below the reviewed security floor');checks++;}
}
for(const section of ['dependencies','devDependencies'])for(const [name,version]of Object.entries(pkg[section]||{})){
 assert.equal(lock.packages[''][section]?.[name],version,'Root lockfile manifest mismatch for '+name);checks++;
}
const nativeVersion=pkg.dependencies['@capacitor/core'];
for(const [section,name]of [['dependencies','@capacitor/ios'],['devDependencies','@capacitor/cli']]){
 assert.equal(pkg[section][name],nativeVersion,'Capacitor versions must be aligned');assert.equal(lock.packages['node_modules/'+name].version,nativeVersion);checks+=2;
}
assert.equal(nativeVersion,'8.5.3');checks++;
const swift=fs.readFileSync(path.join(root,'ios/App/CapApp-SPM/Package.swift'),'utf8');
assert(swift.includes('exact: "'+nativeVersion+'"'),'The native Swift dependency must receive the patch too');checks++;
for(const name of ['@prisma/client','@prisma/adapter-pg']){assert.equal(pkg.dependencies[name],pkg.dependencies.prisma);assert.equal(lock.packages['node_modules/'+name].version,pkg.dependencies.prisma);checks+=2;}
assert.equal(pkg.devDependencies['eslint-config-next'],pkg.dependencies.next);checks++;
assert(!Object.keys(lock.packages).some(name=>name.includes('/@x402/')),'Unused dormant payment dependencies must not return');checks++;
assert.equal(pkg.overrides['@auth/core'],'0.41.3');assert.equal(pkg.overrides.xcode.uuid,'11.1.1');checks+=2;
for(const command of [pkg.scripts.build,pkg.scripts['build:vercel']]){assert(!/migrate|db push/.test(command),'Production build cannot migrate the DB');checks++;}
console.log(`DEPENDENCY_POLICY_PASS ${checks} lock, security floor, native alignment and migration-free build checks`);

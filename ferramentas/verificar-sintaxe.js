const fs=require('fs'); const s=fs.readFileSync(process.argv[2],'utf8');
const re=/<script>([\s\S]*?)<\/script>/g; let m,i=0,ok=true;
while((m=re.exec(s))){ i++; try{ new Function(m[1]); }catch(e){ ok=false; console.log('script',i,e.message); } }
console.log(ok?'syntax ok ('+i+' scripts)':'FAIL');

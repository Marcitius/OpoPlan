import { describe, it, expect } from "vitest";
import { estimateBlockMinutes, estimateScopeMinutes } from "../src/core/estimates";
import { emptyData } from "../src/core/types";
import type { DataSet, Node, Session, SessionBlock } from "../src/core/types";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = (n: number) => ({id:id(n),owner_id:id(1), version:1, created_at:"2026-10-08T08:00:00Z",updated_at:"2026-10-08T08:00:00Z", deleted_at:null});
const node = (n:number,name:string,parent:string|null=null,kind:"block"|"container"="block"):Node => ({...base(n),opposition_id:id(2),parent_id:parent,source_node_id:null,name,kind,position:n,archived:false,importance:3,estimated_minutes:5,notes:""});
function record(d:DataSet,n:number,block:string,kind:"study"|"review",mins:number,date:string){const s:Session={...base(n),opposition_id:id(2),kind,started_at:date,ended_at:date,duration_seconds:mins*60,notes:"",source:"manual",concentration:null,difficulty:null,planned_task_id:null};const a:SessionBlock={...base(n+300),session_id:s.id,node_id:block,allocated_seconds:mins*60,progress:100,completed:true};d.sessions.push(s);d.session_blocks.push(a)}
describe("Estimación por tiempo real",()=>{
 it("primer repaso utiliza el estudio real y no el valor por defecto",()=>{const d=emptyData();d.nodes.push(node(10,"Artículo"));record(d,20,id(10),"study",40,"2026-10-08T10:00:00Z");expect(estimateBlockMinutes(d,id(10),"review").minutes).toBe(32)});
 it("repasos posteriores aprenden de su historial y no de prácticas",()=>{const d=emptyData();d.nodes.push(node(10,"Artículo"));record(d,20,id(10),"study",40,"2026-10-01T10:00:00Z");record(d,21,id(10),"review",21,"2026-10-02T10:00:00Z");record(d,22,id(10),"review",17,"2026-10-03T10:00:00Z");record(d,23,id(10),"review",19,"2026-10-04T10:00:00Z");expect(estimateBlockMinutes(d,id(10),"review").minutes).toBe(19)});
 it("suma las estimaciones de los bloques del tema",()=>{const d=emptyData();d.nodes.push(node(9,"Tema",null,"container"),node(10,"Uno",id(9)),node(11,"Dos",id(9)));record(d,20,id(10),"study",40,"2026-10-08T10:00:00Z");record(d,21,id(11),"study",20,"2026-10-08T10:00:00Z");expect(estimateScopeMinutes(d,id(2),id(9),"review").minutes).toBe(48)})
})

/** Existing cast text remains the saved scene cue, including imported free-form notes. */
export function hasCastName(value:string,name:string){return value.split(/\r?\n/).some(line=>line.trim()===name.trim());}
export function toggleCastName(value:string,name:string,include:boolean){
 if(include)return hasCastName(value,name)?value:[value,name.trim()].filter(Boolean).join('\n');
 return value.split(/\r?\n/).filter(line=>line.trim()!==name.trim()).join('\n');
}

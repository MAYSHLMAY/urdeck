import{BufferAttribute as v,Matrix3 as S,Matrix4 as N,MeshPhongMaterial as w,ShaderChunk as r,ShaderLib as C,UniformsUtils as D,Vector3 as V}from"three";class L{static compressNormals(e,s){e.geometry||console.error("Mesh must contain geometry. ");const o=e.geometry.attributes.normal;if(o||console.error("Geometry must contain normal attribute. "),o.isPacked)return;o.itemSize!=3&&console.error("normal.itemSize is not 3, which cannot be encoded. ");const a=o.array,i=o.count;let t;if(s=="DEFAULT"){t=new Uint8Array(i*3);for(let n=0;n<a.length;n+=3){const c=b.defaultEncode(a[n],a[n+1],a[n+2],1);t[n+0]=c[0],t[n+1]=c[1],t[n+2]=c[2]}e.geometry.setAttribute("normal",new v(t,3,!0)),e.geometry.attributes.normal.bytes=t.length*1}else if(s=="OCT1Byte"){t=new Int8Array(i*2);for(let n=0;n<a.length;n+=3){const c=b.octEncodeBest(a[n],a[n+1],a[n+2],1);t[n/3*2+0]=c[0],t[n/3*2+1]=c[1]}e.geometry.setAttribute("normal",new v(t,2,!0)),e.geometry.attributes.normal.bytes=t.length*1}else if(s=="OCT2Byte"){t=new Int16Array(i*2);for(let n=0;n<a.length;n+=3){const c=b.octEncodeBest(a[n],a[n+1],a[n+2],2);t[n/3*2+0]=c[0],t[n/3*2+1]=c[1]}e.geometry.setAttribute("normal",new v(t,2,!0)),e.geometry.attributes.normal.bytes=t.length*2}else if(s=="ANGLES"){t=new Uint16Array(i*2);for(let n=0;n<a.length;n+=3){const c=b.anglesEncode(a[n],a[n+1],a[n+2]);t[n/3*2+0]=c[0],t[n/3*2+1]=c[1]}e.geometry.setAttribute("normal",new v(t,2,!0)),e.geometry.attributes.normal.bytes=t.length*2}else console.error("Unrecognized encoding method, should be `DEFAULT` or `ANGLES` or `OCT`. ");e.geometry.attributes.normal.needsUpdate=!0,e.geometry.attributes.normal.isPacked=!0,e.geometry.attributes.normal.packingMethod=s,e.material instanceof _||(e.material=new _().copy(e.material)),s=="ANGLES"&&(e.material.defines.USE_PACKED_NORMAL=0),s=="OCT1Byte"&&(e.material.defines.USE_PACKED_NORMAL=1),s=="OCT2Byte"&&(e.material.defines.USE_PACKED_NORMAL=1),s=="DEFAULT"&&(e.material.defines.USE_PACKED_NORMAL=2)}static compressPositions(e){e.geometry||console.error("Mesh must contain geometry. ");const s=e.geometry.attributes.position;if(s||console.error("Geometry must contain position attribute. "),s.isPacked)return;s.itemSize!=3&&console.error("position.itemSize is not 3, which cannot be packed. ");const o=s.array,a=2,i=b.quantizedEncode(o,a),t=i.quantized,n=i.decodeMat;e.geometry.boundingBox==null&&e.geometry.computeBoundingBox(),e.geometry.boundingSphere==null&&e.geometry.computeBoundingSphere(),e.geometry.setAttribute("position",new v(t,3)),e.geometry.attributes.position.isPacked=!0,e.geometry.attributes.position.needsUpdate=!0,e.geometry.attributes.position.bytes=t.length*a,e.material instanceof _||(e.material=new _().copy(e.material)),e.material.defines.USE_PACKED_POSITION=0,e.material.uniforms.quantizeMatPos.value=n,e.material.uniforms.quantizeMatPos.needsUpdate=!0}static compressUvs(e){e.geometry||console.error("Mesh must contain geometry property. ");const s=e.geometry.attributes.uv;if(s||console.error("Geometry must contain uv attribute. "),s.isPacked)return;const o={min:1/0,max:-1/0},a=s.array;for(let t=0;t<a.length;t++)o.min=Math.min(o.min,a[t]),o.max=Math.max(o.max,a[t]);let i;if(o.min>=-1&&o.max<=1){i=new Uint16Array(a.length);for(let t=0;t<a.length;t+=2){const n=b.defaultEncode(a[t],a[t+1],0,2);i[t]=n[0],i[t+1]=n[1]}e.geometry.setAttribute("uv",new v(i,2,!0)),e.geometry.attributes.uv.isPacked=!0,e.geometry.attributes.uv.needsUpdate=!0,e.geometry.attributes.uv.bytes=i.length*2,e.material instanceof _||(e.material=new _().copy(e.material)),e.material.defines.USE_PACKED_UV=0}else i=b.quantizedEncodeUV(a,2),e.geometry.setAttribute("uv",new v(i.quantized,2)),e.geometry.attributes.uv.isPacked=!0,e.geometry.attributes.uv.needsUpdate=!0,e.geometry.attributes.uv.bytes=i.quantized.length*2,e.material instanceof _||(e.material=new _().copy(e.material)),e.material.defines.USE_PACKED_UV=1,e.material.uniforms.quantizeMatUV.value=i.decodeMat,e.material.uniforms.quantizeMatUV.needsUpdate=!0}}class b{static defaultEncode(e,s,o,a){if(a==1){const i=Math.round((e+1)*.5*255),t=Math.round((s+1)*.5*255),n=Math.round((o+1)*.5*255);return new Uint8Array([i,t,n])}else if(a==2){const i=Math.round((e+1)*.5*65535),t=Math.round((s+1)*.5*65535),n=Math.round((o+1)*.5*65535);return new Uint16Array([i,t,n])}else console.error("number of bytes must be 1 or 2")}static defaultDecode(e,s){if(s==1)return[e[0]/255*2-1,e[1]/255*2-1,e[2]/255*2-1];if(s==2)return[e[0]/65535*2-1,e[1]/65535*2-1,e[2]/65535*2-1];console.error("number of bytes must be 1 or 2")}static anglesEncode(e,s,o){const a=parseInt(.5*(1+Math.atan2(s,e)/Math.PI)*65535),i=parseInt(.5*(1+o)*65535);return new Uint16Array([a,i])}static octEncodeBest(e,s,o,a){let i,t,n,c,l;return n=i=h(e,s,o,"floor","floor"),t=M(i),l=E(e,s,o,t),i=h(e,s,o,"ceil","floor"),t=M(i),c=E(e,s,o,t),c>l&&(n=i,l=c),i=h(e,s,o,"floor","ceil"),t=M(i),c=E(e,s,o,t),c>l&&(n=i,l=c),i=h(e,s,o,"ceil","ceil"),t=M(i),c=E(e,s,o,t),c>l&&(n=i),n;function h(p,m,f,d,A){let u=p/(Math.abs(p)+Math.abs(m)+Math.abs(f)),g=m/(Math.abs(p)+Math.abs(m)+Math.abs(f));if(o<0){const x=(1-Math.abs(g))*(u>=0?1:-1),P=(1-Math.abs(u))*(g>=0?1:-1);u=x,g=P;let U=1-Math.abs(u)-Math.abs(g);U>0&&(U+=.001,u+=u>0?U/2:-U/2,g+=g>0?U/2:-U/2)}if(a==1)return new Int8Array([Math[d](u*127.5+(u<0?1:0)),Math[A](g*127.5+(g<0?1:0))]);if(a==2)return new Int16Array([Math[d](u*32767.5+(u<0?1:0)),Math[A](g*32767.5+(g<0?1:0))])}function M(p){let m=p[0],f=p[1];a==1?(m/=m<0?127:128,f/=f<0?127:128):a==2&&(m/=m<0?32767:32768,f/=f<0?32767:32768);const d=1-Math.abs(m)-Math.abs(f);if(d<0){const u=m;m=(1-Math.abs(f))*(m>=0?1:-1),f=(1-Math.abs(u))*(f>=0?1:-1)}const A=Math.sqrt(m*m+f*f+d*d);return[m/A,f/A,d/A]}function E(p,m,f,d){return p*d[0]+m*d[1]+f*d[2]}}static quantizedEncode(e,s){let o,a;s==1?(o=new Uint8Array(e.length),a=255):s==2?(o=new Uint16Array(e.length),a=65535):console.error("number of bytes error! ");const i=new N,t=new Float32Array(3),n=new Float32Array(3);t[0]=t[1]=t[2]=Number.MAX_VALUE,n[0]=n[1]=n[2]=-Number.MAX_VALUE;for(let l=0;l<e.length;l+=3)t[0]=Math.min(t[0],e[l+0]),t[1]=Math.min(t[1],e[l+1]),t[2]=Math.min(t[2],e[l+2]),n[0]=Math.max(n[0],e[l+0]),n[1]=Math.max(n[1],e[l+1]),n[2]=Math.max(n[2],e[l+2]);i.scale(new V((n[0]-t[0])/a,(n[1]-t[1])/a,(n[2]-t[2])/a)),i.elements[12]=t[0],i.elements[13]=t[1],i.elements[14]=t[2],i.transpose();const c=new Float32Array([n[0]!==t[0]?a/(n[0]-t[0]):0,n[1]!==t[1]?a/(n[1]-t[1]):0,n[2]!==t[2]?a/(n[2]-t[2]):0]);for(let l=0;l<e.length;l+=3)o[l+0]=Math.floor((e[l+0]-t[0])*c[0]),o[l+1]=Math.floor((e[l+1]-t[1])*c[1]),o[l+2]=Math.floor((e[l+2]-t[2])*c[2]);return{quantized:o,decodeMat:i}}static quantizedEncodeUV(e,s){let o,a;s==1?(o=new Uint8Array(e.length),a=255):s==2?(o=new Uint16Array(e.length),a=65535):console.error("number of bytes error! ");const i=new S,t=new Float32Array(2),n=new Float32Array(2);t[0]=t[1]=Number.MAX_VALUE,n[0]=n[1]=-Number.MAX_VALUE;for(let l=0;l<e.length;l+=2)t[0]=Math.min(t[0],e[l+0]),t[1]=Math.min(t[1],e[l+1]),n[0]=Math.max(n[0],e[l+0]),n[1]=Math.max(n[1],e[l+1]);i.scale((n[0]-t[0])/a,(n[1]-t[1])/a),i.elements[6]=t[0],i.elements[7]=t[1],i.transpose();const c=new Float32Array([n[0]!==t[0]?a/(n[0]-t[0]):0,n[1]!==t[1]?a/(n[1]-t[1]):0]);for(let l=0;l<e.length;l+=2)o[l+0]=Math.floor((e[l+0]-t[0])*c[0]),o[l+1]=Math.floor((e[l+1]-t[1])*c[1]);return{quantized:o,decodeMat:i}}}class _ extends w{constructor(e){super(),this.defines={},this.type="PackedPhongMaterial",this.uniforms=D.merge([C.phong.uniforms,{quantizeMatPos:{value:null},quantizeMatUV:{value:null}}]),this.vertexShader=["#define PHONG","varying vec3 vViewPosition;","#ifndef FLAT_SHADED","varying vec3 vNormal;","#endif",r.common,r.uv_pars_vertex,r.uv2_pars_vertex,r.displacementmap_pars_vertex,r.envmap_pars_vertex,r.color_pars_vertex,r.fog_pars_vertex,r.morphtarget_pars_vertex,r.skinning_pars_vertex,r.shadowmap_pars_vertex,r.logdepthbuf_pars_vertex,r.clipping_planes_pars_vertex,`#ifdef USE_PACKED_NORMAL
					#if USE_PACKED_NORMAL == 0
						vec3 decodeNormal(vec3 packedNormal)
						{
							float x = packedNormal.x * 2.0 - 1.0;
							float y = packedNormal.y * 2.0 - 1.0;
							vec2 scth = vec2(sin(x * PI), cos(x * PI));
							vec2 scphi = vec2(sqrt(1.0 - y * y), y);
							return normalize( vec3(scth.y * scphi.x, scth.x * scphi.x, scphi.y) );
						}
					#endif

					#if USE_PACKED_NORMAL == 1
						vec3 decodeNormal(vec3 packedNormal)
						{
							vec3 v = vec3(packedNormal.xy, 1.0 - abs(packedNormal.x) - abs(packedNormal.y));
							if (v.z < 0.0)
							{
								v.xy = (1.0 - abs(v.yx)) * vec2((v.x >= 0.0) ? +1.0 : -1.0, (v.y >= 0.0) ? +1.0 : -1.0);
							}
							return normalize(v);
						}
					#endif

					#if USE_PACKED_NORMAL == 2
						vec3 decodeNormal(vec3 packedNormal)
						{
							vec3 v = (packedNormal * 2.0) - 1.0;
							return normalize(v);
						}
					#endif
				#endif`,`#ifdef USE_PACKED_POSITION
					#if USE_PACKED_POSITION == 0
						uniform mat4 quantizeMatPos;
					#endif
				#endif`,`#ifdef USE_PACKED_UV
					#if USE_PACKED_UV == 1
						uniform mat3 quantizeMatUV;
					#endif
				#endif`,`#ifdef USE_PACKED_UV
					#if USE_PACKED_UV == 0
						vec2 decodeUV(vec2 packedUV)
						{
							vec2 uv = (packedUV * 2.0) - 1.0;
							return uv;
						}
					#endif

					#if USE_PACKED_UV == 1
						vec2 decodeUV(vec2 packedUV)
						{
							vec2 uv = ( vec3(packedUV, 1.0) * quantizeMatUV ).xy;
							return uv;
						}
					#endif
				#endif`,"void main() {",r.uv_vertex,`#ifdef USE_UV
					#ifdef USE_PACKED_UV
						vUv = decodeUV(vUv);
					#endif
				#endif`,r.uv2_vertex,r.color_vertex,r.beginnormal_vertex,`#ifdef USE_PACKED_NORMAL
					objectNormal = decodeNormal(objectNormal);
				#endif

				#ifdef USE_TANGENT
					vec3 objectTangent = vec3( tangent.xyz );
				#endif
				`,r.morphnormal_vertex,r.skinbase_vertex,r.skinnormal_vertex,r.defaultnormal_vertex,"#ifndef FLAT_SHADED","	vNormal = normalize( transformedNormal );","#endif",r.begin_vertex,`#ifdef USE_PACKED_POSITION
					#if USE_PACKED_POSITION == 0
						transformed = ( vec4(transformed, 1.0) * quantizeMatPos ).xyz;
					#endif
				#endif`,r.morphtarget_vertex,r.skinning_vertex,r.displacementmap_vertex,r.project_vertex,r.logdepthbuf_vertex,r.clipping_planes_vertex,"vViewPosition = - mvPosition.xyz;",r.worldpos_vertex,r.envmap_vertex,r.shadowmap_vertex,r.fog_vertex,"}"].join(`
`),this.fragmentShader=["#define PHONG","uniform vec3 diffuse;","uniform vec3 emissive;","uniform vec3 specular;","uniform float shininess;","uniform float opacity;",r.common,r.packing,r.dithering_pars_fragment,r.color_pars_fragment,r.uv_pars_fragment,r.uv2_pars_fragment,r.map_pars_fragment,r.alphamap_pars_fragment,r.aomap_pars_fragment,r.lightmap_pars_fragment,r.emissivemap_pars_fragment,r.envmap_common_pars_fragment,r.envmap_pars_fragment,r.cube_uv_reflection_fragment,r.fog_pars_fragment,r.bsdfs,r.lights_pars_begin,r.lights_phong_pars_fragment,r.shadowmap_pars_fragment,r.bumpmap_pars_fragment,r.normalmap_pars_fragment,r.specularmap_pars_fragment,r.logdepthbuf_pars_fragment,r.clipping_planes_pars_fragment,"void main() {",r.clipping_planes_fragment,"vec4 diffuseColor = vec4( diffuse, opacity );","ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );","vec3 totalEmissiveRadiance = emissive;",r.logdepthbuf_fragment,r.map_fragment,r.color_fragment,r.alphamap_fragment,r.alphatest_fragment,r.specularmap_fragment,r.normal_fragment_begin,r.normal_fragment_maps,r.emissivemap_fragment,r.lights_phong_fragment,r.lights_fragment_begin,r.lights_fragment_maps,r.lights_fragment_end,r.aomap_fragment,"vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;",r.envmap_fragment,"gl_FragColor = vec4( outgoingLight, diffuseColor.a );",r.tonemapping_fragment,r.encodings_fragment,r.fog_fragment,r.premultiplied_alpha_fragment,r.dithering_fragment,"}"].join(`
`),this.setValues(e)}}export{L as GeometryCompressionUtils,_ as PackedPhongMaterial};

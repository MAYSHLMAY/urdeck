import{MathUtils as f,Mesh as w,NoBlending as T,OrthographicCamera as y,PlaneGeometry as _,RawShaderMaterial as U,Vector2 as c,WebGLRenderTarget as m}from"three";const t=S(),v=new w(new _(2,2),t),M=new y(0,1,0,1,0,1);let s=null,a=null;class R{constructor(e){a=e,a.compile(v,M)}generateMipmaps(e){if(!("roughnessMap"in e))return;const{roughnessMap:r,normalMap:g}=e;if(r===null||g===null||!r.generateMipmaps||e.userData.roughnessUpdated)return;e.userData.roughnessUpdated=!0;let n=Math.max(r.image.width,g.image.width),o=Math.max(r.image.height,g.image.height);if(!f.isPowerOfTwo(n)||!f.isPowerOfTwo(o))return;const d=a.getRenderTarget(),x=a.autoClear;if(a.autoClear=!1,(s===null||s.width!==n||s.height!==o)&&(s!==null&&s.dispose(),s=new m(n,o,{depthBuffer:!1}),s.scissorTest=!0),n!==r.image.width||o!==r.image.height){const u={wrapS:r.wrapS,wrapT:r.wrapT,magFilter:r.magFilter,minFilter:r.minFilter,depthBuffer:!1},l=new m(n,o,u);l.texture.generateMipmaps=!0,a.setRenderTarget(l),e.roughnessMap=l.texture,e.metalnessMap==r&&(e.metalnessMap=e.roughnessMap),e.aoMap==r&&(e.aoMap=e.roughnessMap),e.roughnessMap.offset.copy(r.offset),e.roughnessMap.repeat.copy(r.repeat),e.roughnessMap.center.copy(r.center),e.roughnessMap.rotation=r.rotation,e.roughnessMap.matrixAutoUpdate=r.matrixAutoUpdate,e.roughnessMap.matrix.copy(r.matrix)}t.uniforms.roughnessMap.value=r,t.uniforms.normalMap.value=g;const i=new c(0,0),h=t.uniforms.texelSize.value;for(let u=0;n>=1&&o>=1;++u,n/=2,o/=2)h.set(1/n,1/o),u==0&&h.set(0,0),s.viewport.set(i.x,i.y,n,o),s.scissor.set(i.x,i.y,n,o),a.setRenderTarget(s),a.render(v,M),a.copyFramebufferToTexture(i,e.roughnessMap,u),t.uniforms.roughnessMap.value=e.roughnessMap;r!==e.roughnessMap&&r.dispose(),a.setRenderTarget(d),a.autoClear=x}dispose(){t.dispose(),v.geometry.dispose(),s?.dispose()}}function S(){const p=new U({uniforms:{roughnessMap:{value:null},normalMap:{value:null},texelSize:{value:new c(1,1)}},vertexShader:`
			precision mediump float;
			precision mediump int;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {

				vUv = uv;

				gl_Position = vec4( position, 1.0 );

			}
		`,fragmentShader:`
			precision mediump float;
			precision mediump int;

			varying vec2 vUv;

			uniform sampler2D roughnessMap;
			uniform sampler2D normalMap;
			uniform vec2 texelSize;

			#define ENVMAP_TYPE_CUBE_UV

			vec4 envMapTexelToLinear( vec4 a ) { return a; }

			#include <cube_uv_reflection_fragment>

			float roughnessToVariance( float roughness ) {

				float variance = 0.0;

				if ( roughness >= r1 ) {

					variance = ( r0 - roughness ) * ( v1 - v0 ) / ( r0 - r1 ) + v0;

				} else if ( roughness >= r4 ) {

					variance = ( r1 - roughness ) * ( v4 - v1 ) / ( r1 - r4 ) + v1;

				} else if ( roughness >= r5 ) {

					variance = ( r4 - roughness ) * ( v5 - v4 ) / ( r4 - r5 ) + v4;

				} else {

					float roughness2 = roughness * roughness;

					variance = 1.79 * roughness2 * roughness2;

				}

				return variance;

			}

			float varianceToRoughness( float variance ) {

				float roughness = 0.0;

				if ( variance >= v1 ) {

					roughness = ( v0 - variance ) * ( r1 - r0 ) / ( v0 - v1 ) + r0;

				} else if ( variance >= v4 ) {

					roughness = ( v1 - variance ) * ( r4 - r1 ) / ( v1 - v4 ) + r1;

				} else if ( variance >= v5 ) {

					roughness = ( v4 - variance ) * ( r5 - r4 ) / ( v4 - v5 ) + r4;

				} else {

					roughness = pow( 0.559 * variance, 0.25 ); // 0.559 = 1.0 / 1.79

				}

				return roughness;

			}

			void main() {

				gl_FragColor = texture2D( roughnessMap, vUv, - 1.0 );

				if ( texelSize.x == 0.0 ) return;

				float roughness = gl_FragColor.g;

				float variance = roughnessToVariance( roughness );

				vec3 avgNormal;

				for ( float x = - 1.0; x < 2.0; x += 2.0 ) {

					for ( float y = - 1.0; y < 2.0; y += 2.0 ) {

						vec2 uv = vUv + vec2( x, y ) * 0.25 * texelSize;

						avgNormal += normalize( texture2D( normalMap, uv, - 1.0 ).xyz - 0.5 );

					}

				}

				variance += 1.0 - 0.25 * length( avgNormal );

				gl_FragColor.g = varianceToRoughness( variance );

			}
		`,blending:T,depthTest:!1,depthWrite:!1});return p.type="RoughnessMipmapper",p}export{R as RoughnessMipmapper};

/*  Halo 3 Loading Animation
 *  Christopher Cruzen
 *  05.03.2020
 *
 *  This program is a heavily modified version of a GPU-based particle shader
 *  provided by Henry Kang in UMSL's Topics in Computer Graphics course.
 *
 *  We stand on the shoulders of giants.
 */ 


/*--- Shader Declarations ---*/

let vertex_particle = `#version 300 es
  
	in vec2 a_texcoord; // texcoord associated with this particle

    uniform mat4 u_proj_mat;
	uniform mat4 u_model_mat;
	uniform mat4 u_view_mat;

	uniform sampler2D u_pos; // obtain particle position from texture

	out vec2 v_texcoord;

	void main() {
		gl_PointSize = 3.0;
		
		vec4 pos = texture(u_pos, a_texcoord); // this particle position
		gl_Position = u_proj_mat * u_view_mat * pos;

        v_texcoord = a_texcoord; // send texcoord to frag shader
    }
`;

let frag_particle = `#version 300 es
	precision mediump float;

    in vec2 v_texcoord; // texcoord associated with this particle
    
    uniform sampler2D u_alpha; // contains alpha and wait info

	out vec4 cg_FragColor; 

	void main() {
		vec4 cout = vec4(0.0); // by default, don't draw this particle
		float alpha = texture(u_alpha, v_texcoord).r; // alpha of this particle
		float wait = texture(u_alpha, v_texcoord).g; // wait of this particle
		
		if (wait < 0.0) cout = vec4(0.2, 0.2, 0.2, alpha);
		// wait time has expired, so draw this particle
		cg_FragColor = cout;  
	}
`;

let frag_velocity = `#version 300 es
	precision mediump float;

	uniform sampler2D u_vel; // velocity texture
	uniform sampler2D u_alpha; // alpha texture
	
	in vec2 v_coord;

	out vec4 cg_FragColor; 

	float random(vec2 p) { // generates random number in [0, 1]
    	return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453123);
	}

	void main() {
		vec3 vel = texture(u_vel, v_coord).rgb;
		float alpha = texture(u_alpha, v_coord).r; // alpha of this particle
		float wait = texture(u_alpha, v_coord).g; // wait of this particle
        if (wait < 0.0) { // wait time over, let's update velocity
			vel.y = vel.y - 0.003;
		}
    	if (alpha < 0.0) { // restart
			float angle = random(v_coord * 10.0) * 3.14159 * 2.0;
			float height = random(v_coord * 20.0) * 0.02 + 0.13;
			float speed = random(v_coord * 30.0) * 0.01 + 0.02;

			float offset = ((v_coord.x / v_coord.y) / 100.0) * 100.0 - 1.0;
            vel.x = 0.05 * (sin((alpha * 2.0 * 3.1415 + offset) * 2.0 + 3.1415)) * (1.0 - alpha);
			vel.y = height / 7.0; // shoot upward
			vel.z = 0.05 * (sin((alpha * 2.0 * 3.1415 + offset) * 2.0 + 3.1415)) * (1.0 - alpha);

		} else {

            // Perform Cyclone Velocity Calculations
            float angle = random(v_coord * 10.0) * 3.14159 * 2.0;
			float height = random(v_coord * 20.0) * 0.02 + 0.13;
			float speed = random(v_coord * 30.0) * 0.01 + 0.02;

            float offset = ((v_coord.x / v_coord.y) / 100.0) * 100.0 - 1.0;
            vel.x = 0.05 * (sin((alpha * 2.0 * 3.1415 + offset) * 2.0 + 3.1415)) * (1.0 - alpha);
			vel.y = height / 7.0; // shoot upward
			vel.z = 0.05 * (sin((alpha * 2.0 * 3.1415 + offset) * 2.0 + 3.1415)) * (1.0 - alpha);

		}

		cg_FragColor = vec4(vel, 1.0); // draw on velocity texture
	}
`;

let frag_position = `#version 300 es
	precision mediump float;

	uniform sampler2D u_pos; // position texture
	uniform sampler2D u_vel; // velocity texture
	uniform sampler2D u_alpha; // alpha texture
	in vec2 v_coord;

	out vec4 cg_FragColor; 

	float random(vec2 p) {
    	return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453123);
	}

	void main() {
		vec3 pos = texture(u_pos, v_coord).rgb; // xyz
		vec3 vel = vec3(0.0);
		float alpha = texture(u_alpha, v_coord).r; // alpha 	
        float wait = texture(u_alpha, v_coord).g; // wait
		if (wait < 0.0) { // wait time over, let's update position
			vel = texture(u_vel, v_coord).rgb; // xyz		    
		}
		if (alpha < 0.0) { // restart
			pos.x = random(v_coord * 10.0) * 0.2;
			pos.y = random(v_coord * 20.0) * 0.2;
			pos.z = random(v_coord * 30.0) * 0.2;
			
			vel = vec3(0.0);
		}
	    cg_FragColor = vec4(pos + vel, 1.0);
	}
`;

let frag_alpha = `#version 300 es
	precision mediump float;

	uniform sampler2D u_alpha; // alpha texture
	in vec2 v_coord;

	out vec4 cg_FragColor; 

	float random(vec2 p) {
    	return fract(sin(dot(p.xy, vec2(12.9898,78.233))) * 43758.5453123);
	}

	void main() {
		float alpha = texture(u_alpha, v_coord).r; // alpha
        float wait = texture(u_alpha, v_coord).g; // wait
        
        wait = wait - 1.0;
        if (alpha < 0.0) {
        	alpha = 1.0;
       	    wait = random(v_coord * 100.0) * 300.0; // [0, 120]
        }
        if (wait < 0.0) { // wait time over, let's update alpha
		    alpha = alpha - 0.005;
		}
		    
        cg_FragColor = vec4(alpha, wait, 0.0, 1.0);
        // note fbo_alpha contains both alpha and wait
	}	
`;

const vertex_display = `#version 300 es
	in vec2 a_position;	
	
	out vec2 v_coord;

	void main() {	   
	   gl_PointSize = 1.0;
	   gl_Position = vec4(a_position, 0.0, 1.0); // 4 corner vertices of quad

	   v_coord = a_position * 0.5 + 0.5; // UV coords: (0, 0), (0, 1), (1, 1), (1, 0)
	}
`;

const frag_display = `#version 300 es
	precision mediump float;
	precision highp sampler2D;

	uniform sampler2D u_image;
	in vec2 v_coord;

	out vec4 cg_FragColor; 

	void main() {
	   cg_FragColor = texture(u_image, v_coord);
	}
`;


/*--- Program Configuration ---*/

let config = {
	RESOLUTION_SCALE: 1.0,                   // Default: 1080p
	BACKGROUND_COLOR: [1.0, 1.0, 1.0, 1.0],
    TEXTURE_SIZE: 100                        // Value squared is max particle count.
}


/*--- Variable Declarations ---*/

let gl, canvas;
let g_proj_mat = new Matrix4();
let g_light_dir = new Vector3([0, 0.4, 0.6]);
let g_model_mat = new Matrix4();
let g_view_mat = new Matrix4();

let vao_image; // vao for drawing image (using 2 triangles)

let g_texcoord_buffer; // texcoord associated with each particle
let g_normal_buffer;
let g_index_buffer;

let prog_particle; // particle renderer
let prog_display; // fbo renderer
let prog_velocity; // velocity updater
let prog_position; // position updater
let prog_alpha; // alpha updater

let fbo_pos; // particle positions
let fbo_vel; // particle velocities
let fbo_alpha; // particle alpha


/*--- Shader Execution Functions ---*/

function cg_init_shaders(gl, vshader, fshader) {
	var program = createProgram(gl, vshader, fshader); // defined in cuon-utils.js

	return program;
}

class GLProgram {
    constructor (vertex_shader, frag_shader) {
        this.attributes = {};
        this.uniforms = {};
        this.program = gl.createProgram();

        this.program = cg_init_shaders(gl, vertex_shader, frag_shader);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw gl.getProgramInfoLog(this.program);
        
        // register attribute variables
        const attribute_count = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < attribute_count; i++) {
            const attribute_name = gl.getActiveAttrib(this.program, i).name;
            this.attributes[attribute_name] = gl.getAttribLocation(this.program, attribute_name);
        }

        // register uniform variables
        const uniform_count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniform_count; i++) {
            const uniform_name = gl.getActiveUniform(this.program, i).name;
            this.uniforms[uniform_name] = gl.getUniformLocation(this.program, uniform_name);
        }
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function $(id) {
  return document.getElementById(id);
}

function main () {
	// Retrieve <canvas> element
	canvas = document.getElementById('canvas');

	// Get the rendering context for WebGL
	gl = canvas.getContext('webgl2');

    // Set Render Resolution
	canvas.width  = 1920 * config.RESOLUTION_SCALE;
    canvas.height = 1080 * config.RESOLUTION_SCALE;

	prog_particle = new GLProgram(vertex_particle, frag_particle);
	prog_particle.bind();

    prog_display = new GLProgram(vertex_display, frag_display);
	
	prog_velocity = new GLProgram(vertex_display, frag_velocity);
	prog_position = new GLProgram(vertex_display, frag_position);
    prog_alpha = new GLProgram(vertex_display, frag_alpha);

	g_proj_mat.setPerspective(30, canvas.width/canvas.height, 1, 10000);
	g_view_mat.setLookAt(0, 3, 10, 0, 2, 0, 0, 1, 0); // eyePos - focusPos - upVector    

	gl.uniformMatrix4fv(prog_particle.uniforms.u_proj_mat, false, g_proj_mat.elements);
	gl.uniformMatrix4fv(prog_particle.uniforms.u_view_mat, false, g_view_mat.elements);
	gl.uniform1i(prog_particle.uniforms.u_sampler, 0);

	// Create particles
	let pa = new Array(config.TEXTURE_SIZE * config.TEXTURE_SIZE); 

	for (let i = 0; i < pa.length; ++i) {
		pa[i] = new Particle();
		init_particle(pa[i], true);
	}

   	vao_image_create();

	cg_init_framebuffers(); // create fbos 
	create_fbos(pa); // initialize fbo data

	init_buffers(prog_particle); 
	send_buffer_data(pa);

    gl.clearColor(
        config.BACKGROUND_COLOR[0],
        config.BACKGROUND_COLOR[1],
        config.BACKGROUND_COLOR[2],
        config.BACKGROUND_COLOR[3]);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	gl.clear(gl.COLOR_BUFFER_BIT);

	let update = function() {    

		gl.clear(gl.COLOR_BUFFER_BIT);

		update_velocity(fbo_vel, fbo_alpha);
		update_position(fbo_pos, fbo_vel, fbo_alpha);
		update_alpha(fbo_alpha);
        
	    draw_particle(fbo_pos, fbo_alpha, pa);

		requestAnimationFrame(update);
	};
	update(); 
}

function init_buffers (prog) {

    // no need to create vertex buffer because
    // we are getting that info from texture map
    // but we still need texcoord buffer because
    // it records how to map particle index to texcoord
  	g_texcoord_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, g_texcoord_buffer);
	gl.vertexAttribPointer(prog.attributes.a_texcoord, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(prog.attributes.a_texcoord);

}

// send buffer data to gpu 
function send_buffer_data (pa) {

	let coords = [];

	for (let i = 0; i < pa.length; ++i) {	
		let y = Math.floor(i / config.TEXTURE_SIZE);
		let x = i - config.TEXTURE_SIZE * y;  
		coords.push(x/config.TEXTURE_SIZE); // [0, 1]
		coords.push(y/config.TEXTURE_SIZE); // [0, 1]
	}

	let texcoords = new Float32Array(coords); 
	gl.bindBuffer(gl.ARRAY_BUFFER, g_texcoord_buffer);    
	gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);
}

//////////////////////////////////////////////////////////////////////
// Particle constructor
function Particle () {
	this.velocity = new Array(3);
	this.position = new Array(3);
	this.angle = 0;
	this.scale = 0;
	this.alpha = 0;
	this.wait = 0;
}

function init_particle (p, wait) {
	// Movement speed
	let angle = Math.random() * Math.PI * 2;
	let height = Math.random() * 0.02 + 0.13;
	let speed = Math.random() * 0.01 + 0.02;

	p.velocity[0] = 0;
	p.velocity[1] = height;
	p.velocity[2] = 0;

	p.position[0] = Math.random() * 0.2;
	p.position[1] = Math.random() * 0.2;
	p.position[2] = Math.random() * 0.2;

	// Rotation angle
	p.angle = Math.random() * 360; // [0, 1]
	// Size
	p.scale = Math.random() * 0.5 + 0.5; // [0.5, 1]
	// Transparency
	p.alpha = 1;
	// In initial stage, lety a time for creation
	if (wait == true) {
		// Time to wait
		p.wait = Math.random() * 300;
	}
}

function create_fbos (pa) {

	let pos = [];
	let vel = [];
	let alpha = [];

	for (let i = 0; i < pa.length; ++i) {
		pos.push(pa[i].position[0]); // x
		pos.push(pa[i].position[1]); // y
		pos.push(pa[i].position[2]); // z
		pos.push(1); // w

		vel.push(pa[i].velocity[0]); // x
		vel.push(pa[i].velocity[1]); // y
		vel.push(pa[i].velocity[2]); // z
		vel.push(1); // w 

		alpha.push(pa[i].alpha); // x
		alpha.push(pa[i].wait); // y
		alpha.push(0); // z
		alpha.push(1); // w 
	}
    
    // add texture image to fbo
	fbo_pos.read.addTexture(new Float32Array(pos));
	fbo_vel.read.addTexture(new Float32Array(vel));
	fbo_alpha.read.addTexture(new Float32Array(alpha));
}

// When attaching a texture to a framebuffer, all rendering commands will 
// write to the texture as if it was a normal color/depth or stencil buffer.
// The advantage of using textures is that the result of all rendering operations
// will be stored as a texture image that we can then easily used in shaders
function create_fbo (w, h, internalFormat, format, type, param) {

    gl.activeTexture(gl.TEXTURE0);
    
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    // create texture image of resolution (w x h)
    // note that here we pass null as texture source data (no texture image source)
    // For this texture, we're only allocating memory and not actually filling it.
    // Filling texture will happen as soon as we render to the framebuffer.    
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    // attach texture to framebuffer so from now on, everything will be 
    // drawn on this texture image    
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); 
    // back to system framebuffer
	
    let texel_x = 1.0 / w;
    let texel_y = 1.0 / h;

    return {
        texture,
        fbo,
        single: true, // single fbo
        width: w,
        height: h,
        texel_x,
        texel_y,
        internalFormat,
        format,
        type,
        attach(id) {
            gl.activeTexture(gl.TEXTURE0 + id);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            return id;
        },
        addTexture(pixel) {
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);// do not flip the image's y-axis
			gl.bindTexture(gl.TEXTURE_2D, texture); // bind TEXTURE_2D to this FBO's texture 
			gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.FLOAT, pixel);
        }
    };
}

// create 2 FBOs so one pixel processing can be done in-place
function create_double_fbo (w, h, internalFormat, format, type, param, depth) {
    let fbo1 = create_fbo(w, h, internalFormat, format, type, param, depth);
    let fbo2 = create_fbo(w, h, internalFormat, format, type, param, depth);

    let texel_x = 1.0 / w;
    let texel_y = 1.0 / h;

    return {
        width: w,
        height: h,
        single: false, // double fbo
        texel_x,
        texel_y,
        get read() {
            // getter for fbo1
            return fbo1;
        },
        set read(value) {
            fbo1 = value;
        },
        get write() {
            // getter for fbo2
            return fbo2;
        },
        set write(value) {
            fbo2 = value;
        },
        swap() {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

function cg_init_framebuffers() {

    gl.getExtension('EXT_color_buffer_float');
    // enables float framebuffer color attachment

    fbo_pos = create_double_fbo(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
    fbo_vel = create_double_fbo(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
    fbo_alpha = create_double_fbo(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);

}

// render to default framebuffer
function render_null (src) {
    let program = prog_display;
    program.bind();

    if (src.single) gl.uniform1i(program.uniforms.u_image, src.attach(7));
    else gl.uniform1i(program.uniforms.u_image, src.read.attach(7));

    gl.viewport(0, 0, canvas.width, canvas.height);

    draw_vao_image(null);
}

function render_img (src, dst) {
    let program = prog_display;
    program.bind();

    if (src.single) gl.uniform1i(program.uniforms.u_image, src.attach(8));
    else gl.uniform1i(program.uniforms.u_image, src.read.attach(8));
    
    gl.viewport(0, 0, dst.width, dst.height);
 
    if (dst.single) draw_vao_image(dst.fbo);
    else {
        draw_vao_image(dst.write.fbo);
        dst.swap();
    }  
}

function update_velocity (vel, alpha) {
    let program = prog_velocity;
    program.bind();

    if (vel.single) gl.uniform1i(program.uniforms.u_vel, vel.attach(1));
    else gl.uniform1i(program.uniforms.u_vel, vel.read.attach(1));
    
    if (alpha.single) gl.uniform1i(program.uniforms.u_alpha, alpha.attach(2));
    else gl.uniform1i(program.uniforms.u_alpha, alpha.read.attach(2));
    
    gl.viewport(0, 0, vel.width, vel.height);
 
    if (vel.single) draw_vao_image(vel.fbo);
    else {
        draw_vao_image(vel.write.fbo);
        vel.swap();
    }  
}

function update_alpha (alpha) {
    let program = prog_alpha;
    program.bind();

    if (alpha.single) gl.uniform1i(program.uniforms.u_alpha, alpha.attach(1));
    else gl.uniform1i(program.uniforms.u_alpha, alpha.read.attach(1));

    gl.viewport(0, 0, alpha.width, alpha.height);
 
    if (alpha.single) draw_vao_image(alpha.fbo);
    else {
        draw_vao_image(alpha.write.fbo);
        alpha.swap();
    }  
}

function update_position (pos, vel, alpha) {
    let program = prog_position;
    program.bind();

    if (pos.single) gl.uniform1i(program.uniforms.u_pos, pos.attach(1));
    else gl.uniform1i(program.uniforms.u_pos, pos.read.attach(1));
    
    if (vel.single) gl.uniform1i(program.uniforms.u_vel, vel.attach(2));
    else gl.uniform1i(program.uniforms.u_vel, vel.read.attach(2));
    
    if (alpha.single) gl.uniform1i(program.uniforms.u_alpha, alpha.attach(3));
    else gl.uniform1i(program.uniforms.u_alpha, alpha.read.attach(3));
    
    gl.viewport(0, 0, pos.width, pos.height);
 
    if (pos.single) draw_vao_image(pos.fbo);
    else {
        draw_vao_image(pos.write.fbo);
        pos.swap();
    }  
}

function draw_particle (pos, alpha, pa) {
    let program = prog_particle;
    program.bind();

    if (pos.single) gl.uniform1i(program.uniforms.u_pos, pos.attach(1));
    else gl.uniform1i(program.uniforms.u_pos, pos.read.attach(1));
    
    if (alpha.single) gl.uniform1i(program.uniforms.u_alpha, alpha.attach(2));
    else gl.uniform1i(program.uniforms.u_alpha, alpha.read.attach(2));
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	gl.viewport(0, 0, canvas.width, canvas.height);

	gl.drawArrays(gl.POINTS, 0, pa.length); // draw points
}

function draw_vao_image (fbo) {
    // bind destination fbo to gl.FRAMEBUFFER
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

    // start recording bindBuffer or vertexAttribPointer
  	gl.bindVertexArray(vao_image);
    
    // draw trangles using 6 indices
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.bindVertexArray(null); // unbind
}

function vao_image_create () {
	// create vao for 2 triangles 
    vao_image = gl.createVertexArray();
    // start recording bindBuffer or vertexAttribPointer
  	gl.bindVertexArray(vao_image);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    // we have 4 vertices, forming a 2x2 square
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    // 0 is a reference to attribute variable 'a_position' in shader

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    // note that we have 6 indices in total (3 for each triangle, or half of square)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    // 2 means (x, y)
    
    gl.bindVertexArray(null); // stop recording
}

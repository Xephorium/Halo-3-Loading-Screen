/*  Halo 3 Loading Animation
 *  Christopher Cruzen
 *  05.03.2020
 *
 *  A WebGL recreation of Halo 3's Loading Screen.
 *  
 *  This program was built atop a simple GPU-based particle shader program
 *  provided by Dr. Henry Kang in UMSL's Topics in Computer Graphics course.
 *  We stand on the shoulders of giants.
 */ 



/*--- Global Configuration ---*/

let config = {
	SPEED: 1.0,                                // Speed of animation
    LENGTH_LOOP:80000,                         // Length of full animation (Final = 75000)
	LENGTH_START_DELAY: 600,                   // Time between full canvas visibility and animation start
	LENGTH_ASSEMBLY_DELAY: 2000,               // Time between animation start and ring assembly start
	LENGTH_RING_ASSEMBLY: 71000,               // Final = 66000
	LENGTH_SLICE_ASSEMBLY: 23,
	LENGTH_PARTICLE_FADE: 1000,                // Length of each particle's fade-in
	LENGTH_BLOCK_FADE: 70,
	LENGTH_BLOCK_HIGHLIGHT: 1000,
	LENGTH_SCENE_FADE: 1500,                   // Length of scene fade-out
	LENGTH_CANVAS_FADE: 2000,                  // Length of canvas fade-in
	RESOLUTION_SCALE: 2.0,                     // Default: 1080p
	BACKGROUND_COLOR: [0.1, 0.115, .15, 1.0],
    RING_SLICES: 1950,                         // Final = 1950
    RING_RADIUS: 3,
    AMBIENT_PARTICLES: 20000,
    AMBIENT_WIDTH: 5,                          // Horizontal area in which ambient particles are rendered
    AMBIENT_HEIGHT: 1.2,                       // Vertical area in which ambient particles are rendered
    AMBIENT_DRIFT: 0.8,                        // Speed at which ambient particles randomly move
    SLICE_PARTICLES: 62,                       // Must be even & match particle offset generation function below
    SLICE_SIZE: 0.006,                         // Distance between slice particles
    SLICE_WIDTH: 4,                            // Number of particles on top and bottom edges of ring
    SLICE_HEIGHT: NaN,                         // Calculated below: ((SLICE_PARTICLES / 2) - SLICE_WIDTH) + 1
    TEXTURE_SIZE: NaN,                         // Calculated below: ceiling(sqrt(RING_SLICES * SLICE_PARTICLES))
    PARTICLE_SIZE: 2.4,
    PARTICLE_WAIT_VARIATION: 500,              // Amount of random flux in particle wait
    PARTICLE_SIZE_CLAMP: false,                // Whether to clamp max particle size when particle scaling enabled
    CAMERA_DIST_MAX: 14,                       // Maximum distance particles are expected to be from camera
    CAMERA_DIST_FACTOR: 1.65,                  // Multiplier for camera-position dependent effects
    LOGO_SCALE: 0.325,                         // Logo Scale Relative to Screen Size
    LOGO_PADDING: 0.2,                         // Logo Padding Relative to Screen Size
    ENABLE_BLOCK_RENDERING: true,              // Whether to render blocks
    ENABLE_DEVELOPER_CAMERA: false,            // Places camera statically perpindicular to first slice
    ENABLE_PARTICLE_SCALING: true,             // Whether particle size changes based on distance from camera
    ENABLE_ALPHA_SCALING: true,                // Whether particle alpha changes based on distance from camera
    ENABLE_LOGO: true
}

// Generated Global Initialization
config.PARTICLE_SIZE = config.PARTICLE_SIZE * config.RESOLUTION_SCALE;
config.TEXTURE_SIZE = Math.ceil(Math.sqrt(config.RING_SLICES * config.SLICE_PARTICLES + config.AMBIENT_PARTICLES));
if (config.SLICE_WIDTH == config.SLICE_PARTICLES) config.SLICE_HEIGHT = 1;
else if (config.SLICE_WIDTH == config.SLICE_PARTICLES / 2) config.SLICE_HEIGHT = 2;
else config.SLICE_HEIGHT = ((config.SLICE_PARTICLES / 2) - config.SLICE_WIDTH) + 2;



/*--- Variable Declarations ---*/

let gl, canvas;
let g_proj_mat = new Matrix4();
let g_light_dir = new Vector3([0, 0.4, 0.6]);
let g_model_mat = new Matrix4();
let g_view_mat = new Matrix4();

let vao_data_texture;           // VAO For Drawing Data Textures (2 Triangles)
let vao_blocks;                 // VAO For Drawing Ring Blocks
let vao_logo;                   // VAO For Drawing Halo Logo (2 Triangles)

let uv_coord_data_buffer;       // Contains UV coordinates for each pixel in particle data textures 

let prog_particle;              // Particle Renderer
let prog_display;               // FBO Renderer
let prog_position;              // Particle Position Updater
let prog_data;                  // Particle Data Updater
let prog_blocks;                // Block Renderer
let prog_logo;                  // Logo Renderer

let fbo_pos_initial;            // Particle Initial Position
let fbo_pos_swerve;             // Particle Swerve Position
let fbo_pos_final;              // Particle Final Position
let fbo_pos;                    // Particle Position
let fbo_data_dynamic;           // Changing Particle Metadata
let fbo_data_static;            // Unchanging Particle Metadata

let texture_list = [];
let camera_pos = [];
let camera_pos_control_points = [
    [-2.4, -0.2, 1.8],
    [-2.1,  .05, 3.0],
    [  .5,  .15, 5.2],
    [ 2.2,  .25,   2],
    [ 2.5, 0.15,   1]
];
let camera_pos_interpolator = new Interpolator(camera_pos_control_points);
let camera_focus = [];
let camera_focus_control_points = [
    [  -3,    0,   0],
    [-2.1,    0, 3.3],
    [ 2.8, -.02, 3.3],
    [   3,  -.1, -.5]
];
let camera_focus_interpolator = new Interpolator(camera_focus_control_points);
let start_time, time;
var canvas_opacity = 0;



/*--- Shader Definitions ---*/


const vertex_display = `#version 300 es
	in vec2 a_position;	
	out vec2 v_coord;

	void main() {
		gl_Position = vec4(a_position, 0.0, 1.0); // 4 corner vertices of quad
		v_coord = a_position * 0.5 + 0.5; // UV coords: (0, 0), (0, 1), (1, 1), (1, 0)
	}
`;

let frag_position = `#version 300 es
	precision highp float;

    // Input Variables
    uniform sampler2D texture_initial_position;
    uniform sampler2D texture_swerve_position;
	uniform sampler2D texture_final_position;
	uniform sampler2D texture_position;
	uniform sampler2D texture_data_static;
	uniform float time;
	uniform float length_loop;
	uniform float length_start_delay;
	uniform float length_assembly_delay;
	uniform float length_ring_assembly;
	uniform float length_slice_assembly;
	in vec2 v_coord; // UV coordinate of current point.

    // Output Variables
	out vec4 cg_FragColor;

    // Procedural Float Generator [-1, 1]
    // Note: Consistently returns the same pseudo-random float for the same two input values.  
	float generate_float(float value_one, float value_two) {
	    float seed_one = 78.0;
	    float seed_two = 13647.0;
	    float magnitude = (mod(floor(value_one * seed_one + value_two * seed_two), 100.0) / 100.0) * 2.0 - 1.0;
	    return magnitude;
	}

	// 3-Point Curve Interpolator
	// Note: Returns a position in 3D space representing a particle's location on
	//       a smooth bezier curve between three points given factor t [0-1]. 
	// Source: https://forum.unity.com/threads/getting-a-point-on-a-bezier-curve-given-distance.382785/ 
	vec4 interpolate_location(vec4 v1, vec4 v2, vec4 v3, float t) {
         float x = (((1.0 - t) * (1.0 - t)) * v1.x) + (2.0 * t * (1.0 - t) * v2.x) + ((t * t) * v3.x);
         float y = (((1.0 - t) * (1.0 - t)) * v1.y) + (2.0 * t * (1.0 - t) * v2.y) + ((t * t) * v3.y);
         float z = (((1.0 - t) * (1.0 - t)) * v1.z) + (2.0 * t * (1.0 - t) * v2.z) + ((t * t) * v3.z);
         return vec4(x, y, z, 1.0);
	}

	void main() {

		// Local Variables
		vec4 initial_position = texture(texture_initial_position, v_coord);
		vec4 swerve_position = texture(texture_swerve_position, v_coord);
		vec4 final_position = texture(texture_final_position, v_coord);
		vec4 current_position = texture(texture_position, v_coord);
		float wait = texture(texture_data_static, v_coord).r;
		float seed = texture(texture_data_static, v_coord).g;
		float ambient = texture(texture_data_static, v_coord).b;
		float temp = mod(time, length_start_delay + length_loop);
		float delay_time = max(temp - length_start_delay, 0.0);

        if (ambient != 1.0) {

        	// Calculate Ring Particle Animation Factor
			float factor = 0.0;
			if (delay_time > wait) {
				factor = min((delay_time - wait - length_assembly_delay) / length_slice_assembly, 1.0);
			}

			// Find Current Position Along Curve
			vec4 position = interpolate_location(initial_position, swerve_position, final_position, factor);

			cg_FragColor = position;
        
        } else {

        	// Calculate Ambient Particle Animation Factor
			float factor = min(delay_time / length_loop, 1.0);

            // Apply Particle Drift
        	cg_FragColor = vec4(
                initial_position[0] + (final_position[0] * factor),
                initial_position[1] + (final_position[1] * factor),
                initial_position[2] + (final_position[2] * factor),
                1.0
        	);
        }
	}
`;

let frag_data = `#version 300 es
	precision mediump float;

    // Input Variables
    uniform sampler2D texture_position;
	uniform sampler2D texture_data_dynamic;
	uniform sampler2D texture_data_static;
	uniform vec3 position_camera;
	uniform float time;
	uniform float length_loop;
	uniform float length_start_delay;
	uniform float length_slice_assembly;
	uniform float length_particle_fade;
	uniform float length_scene_fade;
	uniform float camera_dist_max;
	uniform float camera_dist_factor;
	uniform float alpha_fade;
	in vec2 v_coord;

    // Output Variables
	out vec4 cg_FragColor; 

	void main() {

		// Local Variables
		vec4 position = texture(texture_position, v_coord);
		float alpha = texture(texture_data_dynamic, v_coord).r;
		float brightness = texture(texture_data_dynamic, v_coord).g;
        float wait = texture(texture_data_static, v_coord).r;
        float seed = texture(texture_data_static, v_coord).g;
        float ambient = texture(texture_data_static, v_coord).b;
		float temp = mod(time, length_start_delay + length_loop);
		float delay_time = max(temp - length_start_delay, 0.0);
		float distance = abs(distance(position, vec4(position_camera[0], position_camera[1], position_camera[2], 1.0)));

        // Calculate & Set Alpha Scale
 		float alpha_scale = 1.0;
 		if (alpha_fade == 1.0) {
            alpha_scale = 1.0 - ((distance * camera_dist_factor) / camera_dist_max);
        }

        // Adjust Alpha for Camera Clipping
        float camera_distance_min = 0.05;
 		float camera_distance_min_fade = .5;
 		float factor = (distance - camera_distance_min) / (camera_distance_min_fade - camera_distance_min);
 		factor = min(max(factor, 0.0), 1.0);
        alpha_scale *= factor;

        // Calculate & Set Alpha
        alpha = 0.0;
        if (delay_time <= 0.0) {

        	// Scene Hasn't Started
        	alpha = 0.0;
        	
        } else if (delay_time > length_loop - length_scene_fade) {

			// All Particles - Scene Fade Out
			float scene_fade_out_factor = max((length_loop - delay_time) / length_scene_fade, 0.0);
			alpha = ambient * scene_fade_out_factor * alpha_scale;

		} else if (ambient == 1.0) {

			// Ambient Particles
			float scene_fade_in_factor = min(delay_time / length_particle_fade, 1.0);
			alpha = scene_fade_in_factor * alpha_scale;

		} else if (delay_time > wait) {

			// Assembly Particles

			// Calculate Fade In Factor
			float particle_fade_in_factor = min((delay_time - wait) / length_particle_fade, 1.0);

            // Calculate Fade Out Factor
            float animation_complete = wait + length_scene_fade + length_start_delay + length_slice_assembly;
            float particle_fade_out_factor = 1.0;
            if (delay_time > animation_complete) {
				particle_fade_out_factor = max(1.0 - ((delay_time - animation_complete) / length_particle_fade), 0.0);
			}

            // Apply Alpha
			alpha = particle_fade_in_factor * particle_fade_out_factor * alpha_scale;
		}
		    
        cg_FragColor = vec4(alpha, brightness, 1.0, 1.0);
	}	
`;

let vertex_particle = `#version 300 es

    // Input Variables
    in vec2 uv_coord_data;
    uniform mat4 u_proj_mat;
	uniform mat4 u_model_mat;
	uniform mat4 u_view_mat;
	uniform sampler2D u_pos;
	uniform sampler2D texture_data_static;
	uniform float particle_size;
	uniform float particle_scaling;
	uniform float particle_size_clamp;
	uniform float camera_dist_max;
	uniform float camera_dist_factor;
	uniform vec3 position_camera;

    // Output Variables
	out vec2 uv_coord_data_frag;

	void main() {

		// Local Variables
		vec4 pos = texture(u_pos, uv_coord_data); // this particle position
		float ambient = texture(texture_data_static, uv_coord_data).b;
		gl_Position = u_proj_mat * u_view_mat * pos;

        // Scale Particles Based on Camera Distance
        if (particle_scaling == 1.0) {
        	float distance = distance(pos, vec4(position_camera[0], position_camera[1], position_camera[2], 1.0));
		    gl_PointSize = particle_size * (1.0 / (distance));
		    if (particle_size_clamp == 1.0) gl_PointSize = min(gl_PointSize, particle_size);
        } else {
        	gl_PointSize = particle_size;
        }

        // Scale Particles Based on Role
        float ambient_particle_scale = 2.5;
        float active_particle_scale = 1.15;
        if (ambient == 1.0) {
        	gl_PointSize += gl_PointSize * ambient_particle_scale;
        } else {
        	gl_PointSize += gl_PointSize * active_particle_scale;
        }

        // Send UV Coordinates to Fragment Shader
        uv_coord_data_frag = uv_coord_data;
    }
`;

let frag_particle = `#version 300 es
	precision highp float;

    // Input Variables
    in vec2 uv_coord_data_frag;
    uniform sampler2D texture_data_dynamic;
    uniform sampler2D texture_data_static;

    // Output Variables
	out vec4 cg_FragColor; 

	void main() {

		// Local Variables
		float alpha = texture(texture_data_dynamic, uv_coord_data_frag).r;
		float ambient = texture(texture_data_static, uv_coord_data_frag).b;
		vec3 color = vec3(0.5, 0.9, 1.0);

        // Calculate Particle Transparency
		vec2 location = (gl_PointCoord - 0.5) * 2.0;
		float distance = (1.0 - sqrt(location.x * location.x + location.y * location.y));
		float alpha_final = alpha * (distance / 3.5);
 		
 		// Boost Alpha
        if (ambient != 1.0) {
        	alpha_final = min(alpha_final * 4.0, 1.0) * 0.55;
        } else {
        	alpha_final = min(alpha_final * 1.2, 0.8);
        }

        cg_FragColor = vec4(color.x, color.y, color.z, alpha_final);
	}
`;

let vertex_blocks = `#version 300 es

    // Input Variables
    in vec4 vertex_position;
    in vec2 uv_coordinate;
    uniform mat4 u_proj_mat;
	uniform mat4 u_model_mat;
	uniform mat4 u_view_mat;

    // Output Variables
    out vec2 uv_coordinate_frag;
    out float particle_wait;
    out float block_vertical_factor;

	void main() {

        // Local Variables
        vec4 position = vec4(vertex_position[0], vertex_position[1], vertex_position[2], 1.0);

        // Calculate Vertex Position
		gl_Position = u_proj_mat * u_view_mat * position;

        // Pass Fragment Shader UV Coordinates
        uv_coordinate_frag = uv_coordinate;

		// Pass Fragment Shader Wait & Height
		particle_wait = vertex_position[3];
		block_vertical_factor = min(max(abs(vertex_position[1] / 0.04), 0.66) * 1.1, 1.1);
    }
`;

let frag_blocks = `#version 300 es
	precision highp float;

    // Input Variables
    in vec2 uv_coordinate_frag;
    in float particle_wait;
    in float block_vertical_factor;
    uniform sampler2D highlight_texture;
    uniform float time;
	uniform float length_loop;
	uniform float length_start_delay;
	uniform float length_slice_assembly;
	uniform float length_particle_fade;
	uniform float length_block_fade;
	uniform float length_block_highlight;
	uniform float length_scene_fade;

    // Output Variables
	out vec4 cg_FragColor; 

	void main() {

		// Local Variables
		float temp = mod(time, length_start_delay + length_loop);
		float delay_time = max(temp - length_start_delay, 0.0);
		float scene_fade_out_factor = 1.0;
		float highlight_alpha = texture(highlight_texture, uv_coordinate_frag).r;
		vec3 color = vec3(0.28, 0.678, 0.86);

        // Calculate Block Alpha
        float block_alpha = 0.0;
        float appearance_time = particle_wait + length_scene_fade + length_start_delay + length_slice_assembly + 50.0;

        // Account for Loop Fade Out
        if (delay_time > length_loop - length_scene_fade) {
            scene_fade_out_factor = max((length_loop - delay_time) / length_scene_fade, 0.0);
        }

		if (delay_time > appearance_time) {

			// Adjust Alpha for Fade In
			float block_fade_factor = min((delay_time - appearance_time) / length_block_fade, 1.0);
			block_alpha = block_fade_factor * 0.05;

			// Adjust Alpha for Highlight
			float length_extended_highlight = length_block_highlight + (mod(time, length_loop) / length_loop) * length_block_highlight * 0.5;
			float block_highlight_factor = min((delay_time - appearance_time) / length_extended_highlight, 1.0);
			block_alpha += ((1.0 - block_highlight_factor) / 38.0) * (block_fade_factor * highlight_alpha * 8.5);
		}

        cg_FragColor = vec4(color.x, color.y, color.z, block_alpha * block_vertical_factor * scene_fade_out_factor);
	}
`;

let vertex_logo = `#version 300 es

  // Input Variables
  in vec4 a_position;
  in vec2 uv_coordinate;
  uniform float logo_scale;
  uniform float logo_padding;

  // Output Variables
  out vec2 uv_coordinate_frag;
  
  void main() {

    // Local Variables
    float padding_vert = logo_padding;
    float padding_horiz = logo_padding * .562;

    // Calculate Vertex Position
    if (a_position.x == -1.0 && a_position.y == -1.0) {

    	// Bottom Left
        gl_Position = a_position + vec4((2.0 - (2.0 * logo_scale + padding_horiz)), padding_vert, 0.0, 0.0);

    } else if (a_position.x == -1.0 && a_position.y == 1.0) {

        // Top Left
        gl_Position = a_position + vec4(
            (2.0 - (2.0 * logo_scale + padding_horiz)),
            -(2.0 - (2.0 * logo_scale + padding_vert)),
            0.0, 
            0.0
        );

    } else if (a_position.x == 1.0 && a_position.y == 1.0) {

        // Top Right
        gl_Position = a_position + vec4(-padding_horiz, -(2.0 - (2.0 * logo_scale + padding_vert)), 0.0, 0.0);
    
    } else if (a_position.x == 1.0 && a_position.y == -1.0) {

    	// Bottom Right
        gl_Position = a_position + vec4(-padding_horiz, padding_vert, 0.0, 0.0);
    }

    // Pass Fragment Shader UV Coordinates
    uv_coordinate_frag = uv_coordinate;
  }
`;

let frag_logo = `#version 300 es
  precision mediump float;

  // Input Variables
  in vec2 uv_coordinate_frag;
  uniform sampler2D logo_texture;

  // Output Variables
  out vec4 cg_FragColor;

  void main() {

    // Local Variables
    float logo_shape = texture(logo_texture, uv_coordinate_frag).r;
    float logo_visibility = 0.65;

    cg_FragColor = vec4(0.5, 0.815, 1.0, logo_shape * logo_visibility);
  }
`;

/*--- Main Program ---*/

function main () {

    /* Render Preparation */

	// Retrieve Canvas
	canvas = document.getElementById('canvas');

	// Get & Configure Rendering Context
	gl = canvas.getContext('webgl2');
    gl.clearColor(
        config.BACKGROUND_COLOR[0],
        config.BACKGROUND_COLOR[1],
        config.BACKGROUND_COLOR[2],
        config.BACKGROUND_COLOR[3]);
    gl.enable(gl.BLEND);

    // Begin Loading Textures
    ImageLoader.loadImage(gl, texture_list, "../res/Block Texture.png", 0);
    ImageLoader.loadImage(gl, texture_list, "../res/Corner Logo Bungie.png", 7);

    // Set Render Resolution
	canvas.width  = 1920 * config.RESOLUTION_SCALE;
    canvas.height = 1080 * config.RESOLUTION_SCALE;

    // Create Rendering Programs
	prog_position = new GLProgram(vertex_display, frag_position);
    prog_data = new GLProgram(vertex_display, frag_data);
    prog_blocks = new GLProgram(vertex_blocks, frag_blocks);
    prog_logo = new GLProgram(vertex_logo, frag_logo);
    prog_particle = new GLProgram(vertex_particle, frag_particle);
	prog_particle.bind();

    // Set Up Camera
    if (config.ENABLE_DEVELOPER_CAMERA) {

    	// Define Developer Camera Position
        camera_pos[0] = -3.3; //0.0
        camera_pos[1] = 0.0;  //0.3
        camera_pos[2] = 0.0;  //4.9

        // Define Developer Camera View Matrix
    	g_proj_mat.setPerspective(50, canvas.width/canvas.height, .02, 10000);
    	// LookAt Parameters: camera pos, focus pos, up vector      
        g_view_mat.setLookAt(camera_pos[0], camera_pos[1], camera_pos[2], -3, 0, 0, 0, 1, 0);

    } else {

    	// Define Standard Initial Position
        camera_pos[0] = 0;
        camera_pos[1] = 0;
        camera_pos[2] = 0;

	    // Define Standard View Matrix
        g_proj_mat.setPerspective(50, canvas.width/canvas.height, .02, 10000);
        // LookAt Parameters: camera pos, focus pos, up vector     
	    g_view_mat.setLookAt(camera_pos[0], camera_pos[1], camera_pos[2], 0, 0, 0, 0, 1, 0);
    }

    // Generate Loading Particles
    let loadingParticleFactory = new LoadingParticleFactory(config);
	let pa = loadingParticleFactory.generateLoadingParticles();

    // Create Vertex Array Objects
    create_data_texture_vertex_array_object();
    create_ring_block_vertex_array_object(pa);
    create_logo_vertex_array_object();

    // Create Buffers (Define Input Coordinates for Shaders)
   	initialize_buffers(prog_particle); 
	populate_buffers(pa);

    // Set Up Framebuffer Objects (Hold Particle Data Textures)
	initialize_framebuffer_objects();
	populate_framebuffer_objects(pa);

	// Send Variables to Particle Program
	gl.uniformMatrix4fv(prog_particle.uniforms.u_proj_mat, false, g_proj_mat.elements);
	gl.uniformMatrix4fv(prog_particle.uniforms.u_view_mat, false, g_view_mat.elements);
	gl.uniform1i(prog_particle.uniforms.u_sampler, 0);
	gl.uniform1i(prog_particle.uniforms.texture_data_static, fbo_data_static.read.attach(1));
    gl.uniform1f(prog_particle.uniforms.particle_size, config.PARTICLE_SIZE);
    gl.uniform3fv(prog_particle.uniforms.position_camera, camera_pos);
    gl.uniform1f(prog_particle.uniforms.particle_scaling, config.ENABLE_PARTICLE_SCALING ? 1 : 0);
    gl.uniform1f(prog_particle.uniforms.particle_size_clamp, config.PARTICLE_SIZE_CLAMP ? 1 : 0);

    
    /*-- Preparation Complete --*/

	// Set Time Start
	start_time = performance.now();

	// Fade To Canvas
	fade_to_canvas();
	function fade_to_canvas() {
	   if (canvas_opacity < 1) {
		  canvas_opacity += 0.1;
		  setTimeout(function(){fade_to_canvas()}, 1000 / 60);
		  canvas.style.opacity = canvas_opacity;
		  document.getElementById("loading").style.opacity = 1 - canvas_opacity;
	   }
	}

    // Begin Update Loop
	let update = function() {

		// Update Time
		time = (performance.now() - start_time) * config.SPEED;
		
        // Clear Canvas
		gl.clear(gl.COLOR_BUFFER_BIT);

        // Update Camera
        if (!config.ENABLE_DEVELOPER_CAMERA) {

            // Calculate Camera Loop Factor
            let base_time = time % (config.LENGTH_START_DELAY + config.LENGTH_LOOP);
		    let delay_time = Math.max(base_time - config.LENGTH_START_DELAY, 0.0);
            let loop_factor = Math.min(delay_time / config.LENGTH_LOOP, 1.0);

        	// Update Camera Positions
			camera_pos = camera_pos_interpolator.getInterpolatedPoint(loop_factor);
			camera_focus = camera_focus_interpolator.getInterpolatedPoint(loop_factor);

			// Update View Matrix
			g_view_mat.setLookAt(
			    camera_pos[0],
			    camera_pos[1],
			    camera_pos[2],
			    camera_focus[0],
			    camera_focus[1],
			    camera_focus[2],
			    0,
			    1,
			    0
			);
			gl.uniformMatrix4fv(prog_particle.uniforms.u_view_mat, false, g_view_mat.elements);
			gl.uniform3fv(prog_particle.uniforms.position_camera, camera_pos);
			gl.uniform1f(prog_particle.uniforms.particle_scaling, config.ENABLE_PARTICLE_SCALING ? 1 : 0);
        }

        // Render Scene
		update_particle_positions(fbo_pos_initial, fbo_pos_swerve, fbo_pos_final, fbo_pos, fbo_data_static);
		update_particle_data(fbo_pos, fbo_data_dynamic, fbo_data_static);
		if (config.ENABLE_BLOCK_RENDERING) draw_blocks(g_proj_mat, g_view_mat);
		if (config.ENABLE_LOGO) draw_logo();
	    draw_particles(fbo_pos, fbo_data_dynamic, fbo_data_static, pa);

		requestAnimationFrame(update);
	};
	update();
}


/*--- Shader Program Class ---*/

class GLProgram {
    constructor (vertex_shader, fragment_shader) {
        this.attributes = {};
        this.uniforms = {};

        // Note: Method defined in cuon-utils.js.
        this.program = createProgram(gl, vertex_shader, fragment_shader);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw gl.getProgramInfoLog(this.program);
        
        // Register Attribute Variables
        const attribute_count = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < attribute_count; i++) {
            const attribute_name = gl.getActiveAttrib(this.program, i).name;
            this.attributes[attribute_name] = gl.getAttribLocation(this.program, attribute_name);
        }

        // Register Uniform Variables
        const uniform_count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniform_count; i++) {
            const uniform_name = gl.getActiveUniform(this.program, i).name;
            this.uniforms[uniform_name] = gl.getUniformLocation(this.program, uniform_name);
        }
    }

    bind () {
        gl.useProgram(this.program);
    }

    bind_time() {
    	gl.useProgram(this.program);
        gl.uniform1f(this.uniforms.time, time);
    }
}


/*--- Vertex Array Object Setup ---*/

// Note: This VertexArrayObject contains a square consisting of two triangles,
//       on which each data texture is drawn.
function create_data_texture_vertex_array_object () {

	// Create Vertex Array Object
    vao_data_texture = gl.createVertexArray();
    gl.bindVertexArray(vao_data_texture);

    // Create Vertex Buffer
    let vertex_buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            -1, -1,
            -1, 1,
            1, 1,
            1, -1
        ]),
        gl.STATIC_DRAW
    );
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(prog_particle.uniforms.a_position);

    // Create Vertex Element Buffer (Specifies Shared Vertices by Index)
    let vertex_element_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vertex_element_buffer);
    // Note: Six vertices representing two triangles with a shared edge from bottom left to top right 
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    
    // Unbind
    gl.bindVertexArray(null);

}

// Note: This VertexArrayObject contains the vertices and shared vertex indices
//       required to draw each block in the final ring.
function create_ring_block_vertex_array_object (pa) {

    /* Variable Declarations */

    /* Base Block Vertices
     *
	 *     v6----- v5
	 *    /|      /|
	 *   v1------v0|
	 *   | |     | |
	 *   | |v7---|-|v4
	 *   |/      |/
	 *   v2------v3
	 *
	 * Note: This vertex list contains three vertices for each of the 12 triangles
	 *       in a single cube. Vertices may not be shared when each face requires
	 *       distinct texture coordinates. See Notes.txt for more info.
	 */
    let BLOCK_VERTICES = [
		.1, .1, .1,  -.1, .1, .1,  -.1,-.1, .1,    .1, .1, .1,  -.1,-.1, .1,   .1,-.1, .1, // front
		.1, .1, .1,   .1,-.1, .1,   .1,-.1,-.1,    .1, .1, .1,   .1,-.1,-.1,   .1, .1,-.1, // right
		.1, .1, .1,   .1, .1,-.1,  -.1, .1,-.1,    .1, .1, .1,  -.1, .1,-.1,  -.1, .1, .1, // up
	   -.1, .1, .1,  -.1, .1,-.1,  -.1,-.1,-.1,   -.1, .1, .1,  -.1,-.1,-.1,  -.1,-.1, .1, // left
	   -.1,-.1,-.1,   .1,-.1,-.1,   .1,-.1, .1,   -.1,-.1,-.1,   .1,-.1, .1,  -.1,-.1, .1, // down
		.1,-.1,-.1,  -.1,-.1,-.1,  -.1, .1,-.1,    .1,-.1,-.1,  -.1, .1,-.1,   .1, .1,-.1  // back
    ];

    /* Base Block UV's
	 * Note: This uv list contains an x and y coordinate for each vertex in the
	 *       list above. The order of the two lists matches.
	 */
    let BLOCK_UVS = [
		1,1, 0,1, 0,0,  1,1, 0,0, 1,0, // front
		0,1, 0,0, 1,0,  0,1, 1,0, 1,1, // right
		1,1, 1,0, 0,0,  1,1, 0,0, 0,1, // up
		1,1, 0,1, 0,0,  1,1, 0,0, 1,0, // left
		0,0, 1,0, 1,1,  0,0, 1,1, 0,1, // down
		0,0, 1,0, 1,1,  0,0, 1,1, 0,1  // back
    ];

    /* Block Generation Code */

    /* Note: This section generates the vertices for every block in the constructed 
     *       ring as a triple [X, Y, Z] representing coordinades in 3D space. It then
     *       appends a fourth constant to each vertex W, representing the wait value
     *       of the particle corresponding to that vertex. This value is used to toggle
     *       each block's visibility during rendering in the fragment shader. Next, the
     *       section generates the uv coordinates for each block vertex. Last, the 
     *       loop creates an array containing indices that specify which vertices of
     *       each block are shared (in this case, none) and stores all three lists as
     *       buffer data for processing in the vertex shader.
     * 
     *       Block UV Structure:       [U, V]
     *       Block Vertex Structure:   [X, Y, Z, Wait]
     */
    let FINAL_VERTICES = [];
    let FINAL_UVS = [];
    let FINAL_VERTEX_INDICES = [];

    // For Each Slice
    for (let slice = 0; slice < config.RING_SLICES; slice++) {

    	// For Each Block
    	for (let block = 0; block < config.SLICE_PARTICLES; block++) {

			// Determine Block Data
			let slice_index = slice * config.SLICE_PARTICLES;
			let slice_angle = pa[slice_index + block].slice_angle;
			let block_position = pa[slice_index + block].position_final;
			let block_visibility_offset = pa[slice_index + block].wait;

			// Add 36 Block Vertices
			for (let v = 0; v < 36; v++) {

				// Calculate Vertex Position
				let vertex = [
					BLOCK_VERTICES[(v * 3) + 0] * .029,
					BLOCK_VERTICES[(v * 3) + 1] * .0305235,
					BLOCK_VERTICES[(v * 3) + 2] * .04845
				];

				// Apply Block Rotation
				vertex = Rotator.rotateAroundYAxis(slice_angle, vertex);

				// Add Vertex Values
				FINAL_VERTICES.push(block_position[0] + vertex[0]);
				FINAL_VERTICES.push(block_position[1] + vertex[1]);
				FINAL_VERTICES.push(block_position[2] + vertex[2]);
				FINAL_VERTICES.push(block_visibility_offset);
			}

			// Add 36 * 2 UV Coordinates
			for (let position = 0; position < 72; position++) {
				FINAL_UVS.push(BLOCK_UVS[position]);
			}
    	}
    }

    // Build Index Array
	for (let position = 0; position < 36 * config.RING_SLICES * config.SLICE_PARTICLES; position++) {
		FINAL_VERTEX_INDICES.push(position);
	}

    /* VAO Construction */

	// Create Vertex Array Object
    vao_blocks = gl.createVertexArray();
    gl.bindVertexArray(vao_blocks);

    // Create Vertex Buffer
    let vertex_buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
    gl.enableVertexAttribArray(prog_blocks.uniforms.vertex_position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(FINAL_VERTICES), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

    // Create UV Buffer
    let uv_buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, uv_buffer);
    gl.enableVertexAttribArray(prog_blocks.attributes.uv_coordinate);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(FINAL_UVS), gl.STATIC_DRAW);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    // Create Vertex Element Buffer (Specifies Shared Vertices by Index)
    let vertex_element_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vertex_element_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(FINAL_VERTEX_INDICES), gl.STATIC_DRAW);
    
    // Unbind
    gl.bindVertexArray(null);
}

// Note: This VertexArrayObject contains a square consisting of two triangles,
//       on which the Halo 3 Logo is drawn.
function create_logo_vertex_array_object () {

    /* Variable Declarations */

    /* Logo Vertices
     *
     *  v1-------v2   v4
     *  |       /    / |
     *  |     /    /   |
     *  |   /    /     |
     *  | /    /       |
     *  v0   v3-------v5
     *
	 *
	 * Note: This vertex list contains three vertices for each of the 2 triangles
	 *       in the plane on which the logo is drawn.
	 */
    let LOGO_VERTICES = [
        -1, -1,  -1,  1,   1,  1, // Left Triangle 
        -1, -1,   1,  1,   1, -1  // Right Triangle
    ];

    /* Logo UV's
	 * Note: This uv list contains an x and y coordinate for each vertex in the
	 *       list above. The order of the two lists matches.
	 */
    let LOGO_UVS = [
		0,0, 0,1, 1,1, // Left Triangle 
        0,0, 1,1, 1,0  // Right Triangle
    ];

    // Logo Index Array
    let LOGO_INDICES = [0, 1, 2, 3, 4, 5];

    /* VAO Construction */

	// Create Vertex Array Object
    vao_logo = gl.createVertexArray();
    gl.bindVertexArray(vao_logo);

    // Create Vertex Buffer
    let vertex_buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(LOGO_VERTICES),gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(prog_logo.uniforms.a_position);

    // Create UV Buffer
    let uv_buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, uv_buffer);
    gl.enableVertexAttribArray(prog_logo.attributes.uv_coordinate);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(LOGO_UVS), gl.STATIC_DRAW);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    // Create Vertex Element Buffer (Specifies Shared Vertices by Index)
    let vertex_element_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vertex_element_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(LOGO_INDICES), gl.STATIC_DRAW);
    
    // Unbind
    gl.bindVertexArray(null);

}


/*--- Buffer Setup ---*/

function initialize_buffers (prog) {

    // Initialize Particle Data Buffer
  	uv_coord_data_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uv_coord_data_buffer);
	gl.vertexAttribPointer(prog.attributes.uv_coord_data, 2, gl.FLOAT, false, 0, 0);
	gl.enableVertexAttribArray(prog.attributes.uv_coord_data);

}

// Note: Calculations involving tiny decimals require special care
//       because JavaScript's math is broken. In this case, operations
//       on decimals representing the width of single pixels intermittently
//       produce the wrong result due to floating point errors. To work
//       around the issue, this method uses the arbitrary-precision decimal
//       library decimal.js.
// Source: https://github.com/MikeMcl/decimal.js/
function populate_buffers(pa) {


    /*-- Particle Data Buffer --*/

    // Note: This block calculates the UV coordinates for each pixel of the images
    //       representing a particle's data (initial pos, final pos, pos, etc). Values
    //       are in range [0, 1]. The coordinates are sent to the vertex_particle shader
    //       as uv_coord_data.

    // Declare Variables
    let uv_coord_data = [];
    let pixel_size = (new Decimal(1.0)).dividedBy(new Decimal(config.TEXTURE_SIZE)); // 1 / TEXTURE_SIZE
    let half_pixel_size = pixel_size.dividedBy(new Decimal(2)); // pixel_size / 2

    // Generate Texture Coordinates for Each Pixel
    for (let x = 0; x < config.TEXTURE_SIZE; x++) {
    	for (let y = 0; y < config.TEXTURE_SIZE; y++) {
    		let coord_x = pixel_size.times(new Decimal(x).plus(half_pixel_size)).toPrecision(10);
    		let coord_y = pixel_size.times(new Decimal(y).plus(half_pixel_size)).toPrecision(10);
		    uv_coord_data.push(coord_x);
		    uv_coord_data.push(coord_y);
    	}
    }

    // Send UV Coordinates to GPU
	gl.bindBuffer(gl.ARRAY_BUFFER, uv_coord_data_buffer);    
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv_coord_data), gl.STATIC_DRAW);
}

function initialize_framebuffer_objects() {

    // Enables Float Framebuffer Color Attachment
    gl.getExtension('EXT_color_buffer_float');

    // Enables Larger Index Buffer Size
    // Note: By default, the index buffer size is limited to 16-bit, meaning the greatest
    //       possible number of shared vertices in a single draw call is 65,536. This is
    //       obviously far too few for this program. As an alternative to splitting up the
    //       drawing of ring blocks into multiple draw calls, this line increases the size
    //       limit to 32-bit, or an int. For more detail, see the Stack Overflow post below.
    // Source: https://stackoverflow.com/questions/4998278/is-there-a-limit-of-vertices-in-webgl   
    gl.getExtension('OES_element_index_uint');

    fbo_pos_initial = create_double_framebuffer_object(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    fbo_pos_swerve = create_double_framebuffer_object(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    fbo_pos_final = create_double_framebuffer_object(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    fbo_pos = create_double_framebuffer_object(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    fbo_data_dynamic = create_double_framebuffer_object(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    fbo_data_static = create_double_framebuffer_object(config.TEXTURE_SIZE, config.TEXTURE_SIZE, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);

}

function populate_framebuffer_objects (pa) {

	// Initialize Texture Arrays
	let position_initial = [];
	let position_swerve = [];
	let position_final = [];
	let position = [];
	let data_dynamic = [];
	let data_static = [];

	for (let i = 0; i < pa.length; i++) {

		// Initial Position
		position_initial.push(pa[i].position_initial[0]);
		position_initial.push(pa[i].position_initial[1]);
		position_initial.push(pa[i].position_initial[2]);
		position_initial.push(1);

		// Swerve Position
		position_swerve.push(pa[i].position_swerve[0]);
		position_swerve.push(pa[i].position_swerve[1]);
		position_swerve.push(pa[i].position_swerve[2]);
		position_swerve.push(1);

        // Final Position
		position_final.push(pa[i].position_final[0]);
		position_final.push(pa[i].position_final[1]);
		position_final.push(pa[i].position_final[2]);
		position_final.push(1);

        // Current Position
		position.push(pa[i].position[0]);
		position.push(pa[i].position[1]);
		position.push(pa[i].position[2]);
		position.push(1);

        // Changing Particle Data
		data_dynamic.push(pa[i].alpha);
		data_dynamic.push(pa[i].brightness);
		data_dynamic.push(1);
		data_dynamic.push(1);

		// Unchanging Particle Data
		data_static.push(pa[i].wait);
		data_static.push(pa[i].seed);
		data_static.push(pa[i].ambient);
		data_static.push(1);

	}
    
    // Add Textures to Framebuffer Objects
	fbo_pos_initial.read.addTexture(new Float32Array(position_initial));
	fbo_pos_swerve.read.addTexture(new Float32Array(position_swerve));
	fbo_pos_final.read.addTexture(new Float32Array(position_final));
	fbo_pos.read.addTexture(new Float32Array(position));
	fbo_data_dynamic.read.addTexture(new Float32Array(data_dynamic));
	fbo_data_static.read.addTexture(new Float32Array(data_static));
}

function create_framebuffer_object (w, h, internalFormat, format, type, param) {
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
        single: true,
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

function create_double_framebuffer_object (w, h, internalFormat, format, type, param, depth) {
    let fbo1 = create_framebuffer_object(w, h, internalFormat, format, type, param, depth);
    let fbo2 = create_framebuffer_object(w, h, internalFormat, format, type, param, depth);

    let texel_x = 1.0 / w;
    let texel_y = 1.0 / h;

    return {
        width: w,
        height: h,
        single: false,
        texel_x,
        texel_y,
        get read() {
            return fbo1;
        },
        set read(value) {
            fbo1 = value;
        },
        get write() {
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



/*--- Draw Methods ---*/

function update_particle_positions (position_initial, position_swerve, position_final, position, data_static) {
    let program = prog_position;
    program.bind();

    gl.uniform1i(program.uniforms.texture_initial_position, position_initial.read.attach(1));
    gl.uniform1i(program.uniforms.texture_swerve_position, position_swerve.read.attach(2));
    gl.uniform1i(program.uniforms.texture_final_position, position_final.read.attach(3));
    gl.uniform1i(program.uniforms.texture_position, position.read.attach(4));
    gl.uniform1i(program.uniforms.texture_data_static, data_static.read.attach(5));

    gl.uniform1f(program.uniforms.time, time);
    gl.uniform1f(program.uniforms.length_loop, config.LENGTH_LOOP);
    gl.uniform1f(program.uniforms.length_start_delay, config.LENGTH_START_DELAY);
    gl.uniform1f(program.uniforms.length_assembly_delay, config.LENGTH_ASSEMBLY_DELAY);
    gl.uniform1f(program.uniforms.length_ring_assembly, config.LENGTH_RING_ASSEMBLY);
    gl.uniform1f(program.uniforms.length_slice_assembly, config.LENGTH_SLICE_ASSEMBLY);
    gl.uniform1f(program.uniforms.camera_dist_max, config.CAMERA_DIST_MAX);
    gl.uniform1f(program.uniforms.camera_dist_factor, config.CAMERA_DIST_FACTOR);

    gl.viewport(0, 0, position.width, position.height);
 
    draw_to_framebuffer_object(position.write.fbo);
    position.swap();
}

function update_particle_data (position, data_dynamic, data_static) {
    let program = prog_data;
    program.bind();

    gl.uniform1i(program.uniforms.texture_position, position.read.attach(1));
    gl.uniform1i(program.uniforms.texture_data_dynamic, data_dynamic.read.attach(2));
    gl.uniform1i(program.uniforms.texture_data_static, data_static.read.attach(3));

    gl.uniform3fv(program.uniforms.position_camera, camera_pos);
    gl.uniform1f(program.uniforms.time, time);
    gl.uniform1f(program.uniforms.length_loop, config.LENGTH_LOOP);
    gl.uniform1f(program.uniforms.length_start_delay, config.LENGTH_START_DELAY);
    gl.uniform1f(program.uniforms.length_slice_assembly, config.LENGTH_SLICE_ASSEMBLY);
    gl.uniform1f(program.uniforms.length_particle_fade, config.LENGTH_PARTICLE_FADE);
    gl.uniform1f(program.uniforms.length_scene_fade, config.LENGTH_SCENE_FADE);
    gl.uniform1f(program.uniforms.camera_dist_max, config.CAMERA_DIST_MAX);
    gl.uniform1f(program.uniforms.camera_dist_factor, config.CAMERA_DIST_FACTOR);
    gl.uniform1f(program.uniforms.alpha_fade, config.ENABLE_ALPHA_SCALING ? 1 : 0); 

    gl.viewport(0, 0, data_dynamic.width, data_dynamic.height);
 
    draw_to_framebuffer_object(data_dynamic.write.fbo);
    data_dynamic.swap(); 
}

function draw_to_framebuffer_object (fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  	gl.bindVertexArray(vao_data_texture);
    
    // Draw Trangles Using 6 Vertices
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // Unbind
    gl.bindVertexArray(null);
}

function draw_blocks (g_proj_mat, g_view_mat, index) {
    let program = prog_blocks;
    program.bind();

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    //gl.blendColor(0.51, 0.8, 1.0, 0.02);

    // Send Values to Block Shader
    gl.uniformMatrix4fv(program.uniforms.u_proj_mat, false, g_proj_mat.elements);
	gl.uniformMatrix4fv(program.uniforms.u_view_mat, false, g_view_mat.elements);
	gl.uniform1i(program.uniforms.highlight_texture, 0);
	gl.uniform1f(program.uniforms.time, time);
    gl.uniform1f(program.uniforms.length_loop, config.LENGTH_LOOP);
    gl.uniform1f(program.uniforms.length_start_delay, config.LENGTH_START_DELAY);
    gl.uniform1f(program.uniforms.length_slice_assembly, config.LENGTH_SLICE_ASSEMBLY);
    gl.uniform1f(program.uniforms.length_particle_fade, config.LENGTH_PARTICLE_FADE);
    gl.uniform1f(program.uniforms.length_block_fade, config.LENGTH_BLOCK_FADE);
    gl.uniform1f(program.uniforms.length_block_highlight, config.LENGTH_BLOCK_HIGHLIGHT);
    gl.uniform1f(program.uniforms.length_scene_fade, config.LENGTH_SCENE_FADE);
	
	gl.viewport(0, 0, canvas.width, canvas.height);
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindVertexArray(vao_blocks);

	// Draw All Blocks Using Vertex Indices
	let indices_per_block = 36;
	let indices_to_draw = indices_per_block * config.SLICE_PARTICLES * config.RING_SLICES
    gl.drawElements(gl.TRIANGLES, indices_to_draw, gl.UNSIGNED_INT, 0);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(null);
}


function draw_logo() {
    let program = prog_logo;
    program.bind();

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);

    // Send Values to Logo Shader
// 	gl.uniform1f(program.uniforms.time, time);
//     gl.uniform1f(program.uniforms.length_loop, config.LENGTH_LOOP);
//     gl.uniform1f(program.uniforms.length_start_delay, config.LENGTH_START_DELAY);
//     gl.uniform1f(program.uniforms.length_slice_assembly, config.LENGTH_SLICE_ASSEMBLY);
//     gl.uniform1f(program.uniforms.length_scene_fade, config.LENGTH_SCENE_FADE);
    gl.uniform1i(program.uniforms.logo_texture, 7);
    gl.uniform1f(program.uniforms.logo_scale, config.LOGO_SCALE);
    gl.uniform1f(program.uniforms.logo_padding, config.LOGO_PADDING);
	
	gl.viewport(0, 0, canvas.width, canvas.height);
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindVertexArray(vao_logo);

	// Draw Each Indexed Point of Logo
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(null);
}

function draw_particles (position, data_dynamic, data_static, pa) {
    let program = prog_particle;
    program.bind();

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);

    gl.uniform1i(program.uniforms.u_pos, position.read.attach(1));
    gl.uniform1i(program.uniforms.texture_data_dynamic, data_dynamic.read.attach(2));
    gl.uniform1i(program.uniforms.texture_data_static, data_static.read.attach(3));
	
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	gl.viewport(0, 0, canvas.width, canvas.height);

	gl.drawArrays(gl.POINTS, 0, pa.length);

	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
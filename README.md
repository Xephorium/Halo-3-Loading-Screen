# Halo 3 Loading Screen
A 4K remaster of the Halo 3 loading screen built in WebGL.

![Screenshot Preview](res/Readme%20Screenshot.png)
## 
[Live Site](https://xephorium.github.io/Halo3LoadingScreen/)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
YouTube Loop
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
Wallpaper Engine

<br/>

## Variants

In the spirit of Adrien Perez's legendary easter egg in the original H3 loading screen ([happy birthday, Lauren!](https://teambeyond.net/halo-3-loading-screen-easter-egg-discovered/)), this remaster has a few fun variants. Each can be accessed by appending one of the following flags to the URL. For example: `xephorium.github.io/Halo3LoadingScreen?virgil`

| Screen Variants |
| :---: |
| (no flag - default) |
| installation08 |
| virgil |
| destiny |

The following flags can also be included with any variant to scale resolution or disable individual draw calls. For example: `xephorium.github.io/Halo3LoadingScreen?virgil&2k&nologo`

| Render Flag | Effect |
| :---: | :--- |
| (no flag) | 1080p Resolution |
| 2k | 1440p Resolution |
| 4k | 4K Resolution |
| nologo | Disables Logo |
| nogrid | Disables Background Grid |
| nolines | Disables Guide Lines |
| noblocks | Disables Blocks |
| noparticles | Disables Particles |
| novingette | Disables Vingette Effect |

<br/>

## Credits & Resources
- This program was built atop a simple particle shader program provided by [Henry kang](http://www.cs.umsl.edu/~kang/) in [UMSL](http://www.umsl.edu/)'s Topics in Computer Graphics course. He's a brilliant instructor and kind soul. Go take his class. 
- A great [interactive demo](https://ibiblio.org/e-notes/Splines/bezier.html) of DeCasteljau's bezier spline algorithm. (Adapted for this project's camera pathing.)

<br/><br/>
Were you blinded by its majesty?

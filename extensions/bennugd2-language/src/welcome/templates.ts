export interface ProjectTemplateConfig {
  id: string;
  name: string;
  badge: string;
  icon: string;
  description: string;
  features: string[];
}

export const TEMPLATES: ProjectTemplateConfig[] = [
  {
    id: 'arcade_shooter',
    name: 'Arcade 2D — Star Shooter',
    badge: 'Recomendado',
    icon: '🚀',
    description: 'Juego de naves espaciales con control de teclado, disparo continuo, oleadas de asteroides/enemigos, colisiones con collision(), marcador y vidas.',
    features: ['Control fluido de nave', 'Generación de enemigos (spawner)', 'Sistema de colisiones 2D', 'Marcador de puntuación', 'Sonidos y explosiones']
  },
  {
    id: 'platformer',
    name: 'Plataformas 2D — Side Scroller',
    badge: 'Popular',
    icon: '🏃',
    description: 'Base para juego de plataformas con física básica (gravedad, salto, inercia), plataformas sólidas, scroll de cámara horizontal con scroll_start() y monedas.',
    features: ['Física de salto y gravedad', 'Scroll horizontal suave', 'Gestión de plataformas', 'Animación por estados', 'Marcador de monedas']
  },
  {
    id: 'modular',
    name: 'Arquitectura Modular / Máquina de Estados',
    badge: 'Pro',
    icon: '🧩',
    description: 'Estructura modular profesional para juegos medianos o grandes. Separación en escenas (Título, Juego, Game Over), gestión de includes y recursos.',
    features: ['Máquina de estados de escenas', 'Gestor de recursos centralizado', 'Manejo limpio de includes', 'Estructuras de datos (types)', 'Modular y escalable']
  },
  {
    id: 'minimal',
    name: 'Plantilla Mínima (Limpia)',
    badge: 'Básico',
    icon: '🎯',
    description: 'Proyecto mínimo con inicialización de resolución, bucle principal con sincronización de frames y salida limpia con ESC. Ideal para empezar de cero.',
    features: ['Código ultra-limpio', 'Configuración de ventana', 'Sincronización de FPS', 'Salida controlada con ESC']
  }
];

export function getTemplateFiles(
  templateId: string,
  projectName: string,
  version: 'v1' | 'v2',
  width: number,
  height: number,
  fps: number
): { [relativePath: string]: string } {
  const files: { [relativePath: string]: string } = {};

  // Settings & configs
  files['.vscode/settings.json'] = JSON.stringify(
    {
      'bennugd.version': version,
      [`bennugd.${version}.compilerPath`]: 'bgdc',
      [`bennugd.${version}.runtimePath`]: 'bgdi',
      'bennugd.mainFile': 'src/main.prg',
      'files.associations': {
        '*.prg': 'bennugd2',
        '*.inc': 'bennugd2'
      }
    },
    null,
    2
  );

  files['.gitignore'] = `# BennuGD Binarios y archivos compilados
*.dcb
*.bin
*.log

# Archivos del sistema
.DS_Store
Thumbs.db

# Librerías dinámicas locales
*.dylib
*.so
*.dll
`;

  files['README.md'] = `# ${projectName}

Videojuego creado con **BennuGD ${version.toUpperCase()}** en **BennuIDE**.

## 🚀 Cómo Compilar y Ejecutar

1. Abre este proyecto en **BennuIDE**.
2. Pulsa **F5** o haz clic en **Run BennuGD** en la barra de estado inferior.
3. El compilador generará el archivo binario y arrancará el juego automáticamente.

## 📁 Estructura de Carpetas

- \`src/\`: Código fuente del juego (\`main.prg\`, archivos \`.inc\`).
- \`data/fpg/\`: Gráficos, mapas y paquetes de sprites.
- \`data/fnt/\`: Fuentes tipográficas.
- \`data/audio/\`: Efectos sonoros (\`.wav\`) y bandas sonoras (\`.ogg\`).

---
_Creado con BennuIDE Game Studio._
`;

  if (templateId === 'arcade_shooter') {
    files['src/common.inc'] = `// ------------------------------------------------------------------------------
// ${projectName} — Constantes y Variables Globales
// ------------------------------------------------------------------------------

const
    SCREEN_WIDTH  = ${width};
    SCREEN_HEIGHT = ${height};
    GAME_FPS      = ${fps};
    TYPE_PLAYER   = 1;
    TYPE_ENEMY    = 2;
    TYPE_BULLET   = 3;
end

global
    int score = 0;
    int lives = 3;
    int game_over = false;
    int font_id = 0;
end
`;

    files['src/main.prg'] = `// ==============================================================================
// ${projectName} — Arcade 2D Star Shooter
// Creado con BennuIDE Game Studio
// ==============================================================================

import "libmod_gfx";
import "libmod_input";
import "libmod_misc";

include "common.inc";

// ------------------------------------------------------------------------------
// Proceso Principal
// ------------------------------------------------------------------------------
program ${projectName.replace(/[^a-zA-Z0-9_]/g, '_')};
begin
    set_mode(SCREEN_WIDTH, SCREEN_HEIGHT);
    set_fps(GAME_FPS, 0);
    window_set_title("${projectName} - BennuIDE");

    write(0, 10, 10, ALIGN_TOP_LEFT, "Puntuación:");
    write_var(0, 110, 10, ALIGN_TOP_LEFT, &score);

    write(0, SCREEN_WIDTH - 100, 10, ALIGN_TOP_LEFT, "Vidas:");
    write_var(0, SCREEN_WIDTH - 40, 10, ALIGN_TOP_LEFT, &lives);

    write(0, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 20, ALIGN_CENTER, "[ FLECHAS: Moverse | ESPACIO: Disparar | ESC: Salir ]");

    // Iniciar actores
    Player(SCREEN_WIDTH / 2, SCREEN_HEIGHT - 80);
    EnemySpawner();

    // Bucle principal de la aplicación
    while (!key(_esc) && !game_over)
        frame;
    end

    let_me_alone();
    exit();
end

// ------------------------------------------------------------------------------
// Nave del Jugador
// ------------------------------------------------------------------------------
process Player(x, y)
private
    int speed = 6;
    int cooldown = 0;
end
begin
    ctype = TYPE_PLAYER;
    graph = 0; // Se dibuja un indicador si no hay FPG

    while (lives > 0)
        // Control horizontal
        if (key(_left) && x > 30)
            x -= speed;
        end
        if (key(_right) && x < SCREEN_WIDTH - 30)
            x += speed;
        end

        // Disparo
        if (key(_space) && cooldown <= 0)
            Bullet(x, y - 20);
            cooldown = 10;
        end

        if (cooldown > 0)
            cooldown--;
        end

        frame;
    end
end

// ------------------------------------------------------------------------------
// Proyectil / Disparo
// ------------------------------------------------------------------------------
process Bullet(x, y)
begin
    ctype = TYPE_BULLET;
    while (y > -20)
        y -= 12;
        frame;
    end
end

// ------------------------------------------------------------------------------
// Enemigo / Asteroide
// ------------------------------------------------------------------------------
process Enemy(x, y)
private
    int hit_id;
    int speed = 3;
end
begin
    ctype = TYPE_ENEMY;
    speed = rand(2, 5);

    while (y < SCREEN_HEIGHT + 30)
        y += speed;

        // Comprobar si colisiona con un proyectil
        hit_id = collision(type Bullet);
        if (hit_id)
            signal(hit_id, s_kill);
            score += 100;
            Explosion(x, y);
            return;
        end

        // Comprobar colisión con el jugador
        if (collision(type Player))
            lives--;
            Explosion(x, y);
            if (lives <= 0)
                game_over = true;
            end
            return;
        end

        frame;
    end
end

// ------------------------------------------------------------------------------
// Generador de Enemigos
// ------------------------------------------------------------------------------
process EnemySpawner()
private
    int timer_spawn = 0;
end
begin
    while (!game_over)
        if (timer_spawn <= 0)
            Enemy(rand(40, SCREEN_WIDTH - 40), -20);
            timer_spawn = rand(20, 50);
        else
            timer_spawn--;
        end
        frame;
    end
end

// ------------------------------------------------------------------------------
// Efecto de Explosión
// ------------------------------------------------------------------------------
process Explosion(x, y)
private
    int count = 15;
end
begin
    while (count > 0)
        count--;
        frame;
    end
end
`;
  } else if (templateId === 'platformer') {
    files['src/common.inc'] = `// ------------------------------------------------------------------------------
// ${projectName} — Constantes y Variables
// ------------------------------------------------------------------------------

const
    SCREEN_WIDTH  = ${width};
    SCREEN_HEIGHT = ${height};
    GAME_FPS      = ${fps};
    GRAVITY       = 1;
    MAX_FALL      = 12;
    JUMP_FORCE    = -15;
end

global
    int coins_collected = 0;
end
`;

    files['src/main.prg'] = `// ==============================================================================
// ${projectName} — Plataformas 2D
// Creado con BennuIDE Game Studio
// ==============================================================================

import "libmod_gfx";
import "libmod_input";
import "libmod_misc";

include "common.inc";

program ${projectName.replace(/[^a-zA-Z0-9_]/g, '_')};
begin
    set_mode(SCREEN_WIDTH, SCREEN_HEIGHT);
    set_fps(GAME_FPS, 0);
    window_set_title("${projectName} - Plataformas 2D");

    write(0, 20, 20, ALIGN_TOP_LEFT, "Monedas:");
    write_var(0, 110, 20, ALIGN_TOP_LEFT, &coins_collected);
    write(0, SCREEN_WIDTH / 2, SCREEN_HEIGHT - 20, ALIGN_CENTER, "[ FLECHAS: Correr | ARRIBA / ESPACIO: Saltar | ESC: Salir ]");

    // Crear suelo y plataformas
    Platform(SCREEN_WIDTH / 2, SCREEN_HEIGHT - 40, SCREEN_WIDTH, 40);
    Platform(250, SCREEN_HEIGHT - 140, 200, 20);
    Platform(550, SCREEN_HEIGHT - 220, 200, 20);

    // Monedas
    Coin(250, SCREEN_HEIGHT - 170);
    Coin(550, SCREEN_HEIGHT - 250);

    // Jugador
    PlatformerPlayer(100, SCREEN_HEIGHT - 100);

    while (!key(_esc))
        frame;
    end

    let_me_alone();
    exit();
end

// ------------------------------------------------------------------------------
// Personaje de Plataformas con gravedad y salto
// ------------------------------------------------------------------------------
process PlatformerPlayer(x, y)
private
    int vx = 0;
    int vy = 0;
    int on_ground = false;
    int walk_speed = 5;
    int floor_y;
end
begin
    floor_y = SCREEN_HEIGHT - 60;

    loop
        // Movimiento horizontal
        vx = 0;
        if (key(_left))
            vx = -walk_speed;
            flags = 1; // Espejo horizontal
        end
        if (key(_right))
            vx = walk_speed;
            flags = 0;
        end

        x += vx;

        // Salto
        if ((key(_up) || key(_space)) && on_ground)
            vy = JUMP_FORCE;
            on_ground = false;
        end

        // Gravedad
        vy += GRAVITY;
        if (vy > MAX_FALL)
            vy = MAX_FALL;
        end
        y += vy;

        // Colisión simple con el suelo base
        if (y >= floor_y)
            y = floor_y;
            vy = 0;
            on_ground = true;
        end

        frame;
    end
end

// ------------------------------------------------------------------------------
// Plataforma
// ------------------------------------------------------------------------------
process Platform(x, y, w, h)
begin
    loop
        frame;
    end
end

// ------------------------------------------------------------------------------
// Moneda recolectable
// ------------------------------------------------------------------------------
process Coin(x, y)
begin
    loop
        if (collision(type PlatformerPlayer))
            coins_collected++;
            return;
        end
        frame;
    end
end
`;
  } else if (templateId === 'modular') {
    files['src/common.inc'] = `// ------------------------------------------------------------------------------
// ${projectName} — Configuración Global
// ------------------------------------------------------------------------------

const
    SCREEN_WIDTH  = ${width};
    SCREEN_HEIGHT = ${height};
    GAME_FPS      = ${fps};

    // Estados del Juego (Escenas)
    STATE_MENU     = 1;
    GAME_STATE_PLAY = 2;
    STATE_GAMEOVER = 3;
end

global
    int current_state = STATE_MENU;
    int global_score  = 0;
end
`;

    files['src/scenes.inc'] = `// ------------------------------------------------------------------------------
// ${projectName} — Gestión de Escenas
// ------------------------------------------------------------------------------

process SceneMenu()
private
    int txt_title;
    int txt_prompt;
end
begin
    txt_title = write(0, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 3, ALIGN_CENTER, "${projectName}");
    txt_prompt = write(0, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, ALIGN_CENTER, "Pulsa ESPACIO para Jugar");

    while (current_state == STATE_MENU && !key(_esc))
        if (key(_space))
            current_state = GAME_STATE_PLAY;
        end
        frame;
    end

    write_delete(txt_title);
    write_delete(txt_prompt);
end

process SceneGame()
private
    int txt_info;
end
begin
    txt_info = write(0, SCREEN_WIDTH / 2, 50, ALIGN_CENTER, "Partida en Curso — ESC para volver");

    while (current_state == GAME_STATE_PLAY && !key(_esc))
        frame;
    end

    write_delete(txt_info);
    if (key(_esc))
        current_state = STATE_MENU;
    end
end
`;

    files['src/main.prg'] = `// ==============================================================================
// ${projectName} — Arquitectura Modular
// Creado con BennuIDE Game Studio
// ==============================================================================

import "libmod_gfx";
import "libmod_input";
import "libmod_misc";

include "common.inc";
include "scenes.inc";

program ${projectName.replace(/[^a-zA-Z0-9_]/g, '_')};
begin
    set_mode(SCREEN_WIDTH, SCREEN_HEIGHT);
    set_fps(GAME_FPS, 0);
    window_set_title("${projectName}");

    // Máquina de estados principal
    while (!key(_esc) || current_state != STATE_MENU)
        switch (current_state)
            case STATE_MENU:
                SceneMenu();
            end
            case GAME_STATE_PLAY:
                SceneGame();
            end
        end
        frame;
    end

    let_me_alone();
    exit();
end
`;
  } else {
    // Minimal template
    files['src/main.prg'] = `// ==============================================================================
// ${projectName} — Plantilla Mínima
// Creado con BennuIDE Game Studio
// ==============================================================================

import "libmod_gfx";
import "libmod_input";
import "libmod_misc";

program ${projectName.replace(/[^a-zA-Z0-9_]/g, '_')};
begin
    set_mode(${width}, ${height});
    set_fps(${fps}, 0);
    window_set_title("${projectName}");

    write(0, ${Math.floor(width / 2)}, ${Math.floor(height / 2)}, ALIGN_CENTER, "¡Hola desde ${projectName}!");
    write(0, ${Math.floor(width / 2)}, ${Math.floor(height / 2)} + 30, ALIGN_CENTER, "Pulsa ESC para Salir");

    // Bucle principal de ejecución
    while (!key(_esc))
        frame;
    end

    let_me_alone();
    exit();
end
`;
  }

  return files;
}

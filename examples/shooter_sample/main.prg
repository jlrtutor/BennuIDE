// ==============================================================================
// BennuIDE - Ejemplo de Videojuego: Star Shooter 2D
// Demostración de sintaxis BennuGD2, procesos concurrentes, gráficos y control.
// ==============================================================================

import "libmod_gfx";
import "libmod_input";
import "libmod_misc";
import "libmod_sound";

global
    int score = 0;
    int high_score = 1000;
    int game_over = false;
    int font_id;
    int sound_laser;
    int sound_explosion;
end

// ------------------------------------------------------------------------------
// Proceso Principal (Entrypoint)
// ------------------------------------------------------------------------------
program StarShooter;
begin
    // 1. Configuración de Pantalla y Tasa de Refresco
    set_mode(800, 600);
    set_fps(60, 0);
    window_set_title("BennuIDE - Star Shooter 2D");

    // 2. Textos en pantalla
    write(0, 10, 10, ALIGN_TOP_LEFT, "Puntuación:");
    write_var(0, 110, 10, ALIGN_TOP_LEFT, &score);
    write(0, 400, 10, ALIGN_TOP, "[ Flechas: Moverse | ESPACIO: Disparar | ESC: Salir ]");

    // 3. Crear instancias de actores
    Player(400, 520);
    EnemySpawner();

    // 4. Bucle principal del juego
    while (!key(_esc))
        frame;
    end

    // 5. Salir del juego
    let_me_alone();
    exit();
end

// ------------------------------------------------------------------------------
// Proceso Jugador
// ------------------------------------------------------------------------------
process Player(x, y)
private
    int speed = 5;
    int shoot_cooldown = 0;
end

begin
    graph = 1; // ID de gráfico
    flags = 0;

    loop
        // Movimiento en 4 direcciones
        if (key(_left) && x > 20)
            x -= speed;
        end
        if (key(_right) && x < 780)
            x += speed;
        end
        if (key(_up) && y > 50)
            y -= speed;
        end
        if (key(_down) && y < 580)
            y += speed;
        end

        // Disparo con cadencia
        if (shoot_cooldown > 0)
            shoot_cooldown--;
        elseif (key(_space))
            Laser(x, y - 15);
            shoot_cooldown = 12; // 5 disparos por segundo a 60 FPS
        end

        // Comprobar colisión con enemigos
        if (collision(type Enemy))
            Explosion(x, y);
            game_over = true;
            break;
        end

        frame;
    end
end

// ------------------------------------------------------------------------------
// Proceso Láser (Disparo)
// ------------------------------------------------------------------------------
process Laser(x, y)
private
    int laser_speed = 10;
end

begin
    graph = 2;

    while (y > -20)
        y -= laser_speed;

        // Comprobar impacto con cualquier enemigo
        int hit_enemy = collision(type Enemy);
        if (hit_enemy != 0)
            signal(hit_enemy, s_kill);
            Explosion(x, y);
            score += 100;
            break;
        end

        frame;
    end
end

// ------------------------------------------------------------------------------
// Proceso Enemigo
// ------------------------------------------------------------------------------
process Enemy(x, y)
private
    int enemy_speed;
    int wave_offset;
end

begin
    graph = 3;
    enemy_speed = rand(2, 5);
    wave_offset = rand(0, 360000);

    while (y < 650)
        y += enemy_speed;
        x += sin(y * 1000 + wave_offset) * 2;

        frame;
    end
end

// ------------------------------------------------------------------------------
// Generador de Oleadas de Enemigos
// ------------------------------------------------------------------------------
process EnemySpawner()
private
    int timer = 0;
end

begin
    loop
        if (timer <= 0)
            Enemy(rand(40, 760), -30);
            timer = rand(30, 70);
        else
            timer--;
        end

        frame;
    end
end

// ------------------------------------------------------------------------------
// Efecto Visual de Explosión
// ------------------------------------------------------------------------------
process Explosion(x, y)
private
    int step = 0;
end

begin
    size = 50;
    while (step < 15)
        size += 10;
        alpha -= 15;
        step++;
        frame;
    end
end

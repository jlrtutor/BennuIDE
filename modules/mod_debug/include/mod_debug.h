#ifndef __MOD_DEBUG_H
#define __MOD_DEBUG_H

#ifdef __cplusplus
extern "C" {
#endif

void mod_debug_init(void);
void mod_debug_on_instruction(const char *file, int line);
void mod_debug_cleanup(void);

#ifdef __cplusplus
}
#endif

#endif

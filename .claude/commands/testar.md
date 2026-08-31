---
description: Roda a suíte de testes no container e resume as falhas
---
Rode `make test` (pytest dentro do container `bi-margem-lucro-api`).

Se o container não estiver de pé, suba com `make dev` antes.

Ao final, resuma apenas as falhas: teste, arquivo:linha, valor esperado vs. obtido.
Lembre-se de que os testes de valor são ancorados no baseline real de 07/2026 —
antes de propor alterar um número esperado, verifique se o dado de origem mudou.

Argumentos opcionais ($ARGUMENTS) são repassados ao pytest (ex.: `-k carteira`).

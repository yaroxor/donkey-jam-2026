# Design Document for Game Jam Game

## (рабочее назвагние) Slick Hand Joe

## Общая концепция

Игра про скелета и его напарника -- его руку.
И то как они вместе совершают ловкие ограбления.

У игры два лупа, за Скелета и за Руку.
За Скелета ты забалтываешь жертву.
За Руку ты бегаешь по столу и собираешь лут.
Жертва иногда оборачивается на стол. Частота зависит от того насколько успешно ты ведешь беседу.
В этот момент Рука должна спрятаться в один из тайничков на карте.
Таким образом, два лупа взаимовлияют -- чем лучше Скелет говорит, тем реже Руке нужно прерываться. Чем быстрее Рука соберет лут, тем меньше Скелету придется общаться.

## Сюжет / Лор

При жизни Джо был вором. За это ему отрубили руку. Вором он и остался в посмертии. Попав в Ад он снова встретился со своей утерянной рукой. И они стали напарниками.

Из них вышел отличный дуэт, ведь у Скелета серебрянный язык, а Рука такая юркая!

Награбленное Скелет складывает в воровской ~~карман~~ таз, ловко скрытый от собеседника плащом.

---

## Alt eng descr

The game: two interleaved loops. Skeleton Joe sweet-talks the demon victim through an emoji association Q&A; meanwhile his severed hand
scuttles the table grabbing loot before a timer. Wrong/late answers raise a 4-stage suspicion meter; a full meter fires an alarm (the demon reacts);
the hand can duck into stash holes. Win = collect the loot target before time's up. Lose = caught by the alarm's table-check, or timer expires
short.

## v1.0 code-side status

Implemented and shipped (gate-green, 115 unit + 10 e2e tests):

- Dialogue loop (idle→asking→cooldown FSM, emoji Q&A, layout-independent answer keys, suspicion meter)
- Arcade loop (auto-moving hand FSM, steering, edge-wrap, loot spawn/collect with keep-outs, loot meter HUD)
- Stun on wall crash (freeze + loot−1 + suspicion+1 + SFX + indicator + bounce)
- Level timer + all three end conditions
- Stash holes (нычка) — auto-hide that holds through the alarm check
- Alarm reactions (both) — sus-4 rolls look-at-table (2s window, stash check, red drain bar + "hide!") or storm (3s bubble bury, no check); both
  settle to baseline. Now 70/30 (you flipped it).
- Sus-coupled 4-track music + settle cut, mute, settings (volume + DEV tuners)
- All 8 scenes, pause menu, custom cursor
- DEV tooling (keys 1–4: suspend questions/loot, hold look-over, force reaction) + on-screen readout
- Forge CI gate as the single quality system

---

## Art

### Рисунок

Done: Начальное меню с кнопками, Эмоции скелета, Эмоции Демонюги, Анимация руки, Игровое поле, Пауза, Шкала награбленного, Предметы для кражи (лут), Препятствия, Диалоговые пузыри

**Фиксы**: перенесены в [`TODOS.md`](./TODOS.md).

Goetia -- Lesser Key of Solomon -- Aleister Crowley

#### _Опционально_

Перенесено в [`TODOS.md`](./TODOS.md) (v2.0 backlog).

#### Сцены

- Загрузка
- Главное меню
  - Инфо -- разработчики
  - Найстройки -- управление
  - Старт игры
- Игра
  - Комикс про персонажа
  - Карта путешествия
  - Talk&Steel
- Конец игры

#### Игра

4 Состояния в диалоге.

### Музыка

Перескок на другой луп при росте подозрения. Сброс на 2й трек после доигрыша ивента.

---

## Gameplay

### Arcade

**Lose conditions**:

- Таймер. На прохождение уровня отводится ограниченное время.
- Спалился. Если проиграл в диалоге (набрал шкалу подозрения), и не успел спрятаться.

После 1го палева возвращается не до идеального состояния.

Палево: если 4 раза проиграл в диалоге, то оппонент смотрит на стол.

**_Особая механика_**: Стан. Когда врезаешься в препятствие станишься на секунду, теряешь от шкалы лута, добавляешь к шкале подозрения (шумишь).

**Win conditions**: Собрать нужное кол-во лута за данное время.

### Диалоги

Эмодзи, игра в ассоциации от того какую эмоцию показал оппонент.

**_Особая Механика_**: загрузить вопросами. Когда собеседник начинает что-то подозревать, кроме обычного посомотреть на стол, он может завалить тебя вопросами -- пузыри с ними буквально перекроют стол, так что игрок не будет видеть Руку.

---

**Открытые задачи**: см. [`TODOS.md`](./TODOS.md) -- там и v1.0, и v2.0, и баги, и отложенные решения.

---

**Идеи для новых уровней**: перенесены в [`TODOS.md`](./TODOS.md) (v2.0 backlog).

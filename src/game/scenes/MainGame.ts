import { Scene } from 'phaser';

import { GAME_WIDTH, GAME_HEIGHT, SCREEN_CENTER } from '../config.ts';

interface Pos {
    x: number,
    y: number
}

interface GameObjPos {
    x: number,
    y: number,
    width: number,
    height: number
}

enum Direction {
  Up,
  Down,
  Left,
  Right,
}

const letterKeyCodes: Record<string, number> = {
    'O': 79,
    'E': 69,
    'U': 85
}

// TODO?: mb move to utilities or smth
// Source - https://stackoverflow.com/a/2450976
// Posted by ChristopheD, modified by community. See post 'Timeline' for change history
// Retrieved 2026-02-04, License - CC BY-SA 4.0
function shuffle(array: Array<string>) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {

    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
}

// TODO: follow convention: if smth used only inside one method it is this method scope variable. if it used in several methods it is class property
export class MainGame extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;

    cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    rightAnswerKey: Phaser.Input.Keyboard.Key | number;
    wrongAnswer1Key: Phaser.Input.Keyboard.Key | number;
    wrongAnswer2Key: Phaser.Input.Keyboard.Key | number;

    layout: Phaser.GameObjects.Image;

    bubblePlayer: Phaser.GameObjects.Image;
    bubbleEnemy: Phaser.GameObjects.Image;
    emojisImages: Phaser.GameObjects.Group;
    wrong1: Phaser.GameObjects.Image;
    wrong2: Phaser.GameObjects.Image;
    dialogueGoing: boolean;
    timeDialogueEnd: number;
    emojis: string[];
    qAndA: Record<string, string>;
    answerKeysLetters: Array<string>;

    arcadeAreaCoords: GameObjPos;
    arcadeArea: Phaser.GameObjects.Rectangle;

    blocks: Phaser.Physics.Arcade.Group;
    hand: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    handMoveDirection: Direction;

    isLoot: boolean;
    loot: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    lootCount: number;
    lootScoreMsg: Phaser.GameObjects.Text;

    constructor ()
    {
        super('MainGame');
    }

    private getLootRandomPos(arcadeArea: GameObjPos): Pos
    {
        // TODO: random from interrupted interval
        const x = Math.random() * arcadeArea.width + arcadeArea.x;
        const y = Math.random() * arcadeArea.height + arcadeArea.y;
        const lootPos = { x: x, y: y};
        return lootPos;
    }

    private answerConstructor(Pos: Pos, Letter: string, Emoji: string)
    {
        this.add.text(
            (Pos.x - 150),
            (Pos.y - 50),
            `${Letter}`,
            {
                fontFamily: 'Eater',
                fontSize: '96px',
                color: '#33ff33'
            }
        );
        const answer = this.add.image(Pos.x, Pos.y, Emoji);
        answer.setDepth(1);
        this.emojisImages.add(answer);
    }

    private setupDialogue(QAndA: Record<string, string>, Emojis: string[])
    {
        this.dialogueGoing = true;
        const questions: Array<string> = Object.keys(QAndA);
        const question: string = questions[Math.floor(Math.random()*questions.length)];

        this.time.delayedCall(0, () => {
            this.bubbleEnemy.setAlpha(1);
        })
        this.time.delayedCall(300, () => {
            const questionImage = this.add.image((GAME_WIDTH - 200), 400, question);
            questionImage.setDepth(1);
            this.emojisImages.add(questionImage);
        })
        this.time.delayedCall(600, () => {
            this.bubblePlayer.setAlpha(1);
        })

        const answer: string = QAndA[question];
        let wrongs: Array<string> = Emojis.filter((emoji) => emoji !== question && emoji !== answer);
        const wrong1: string = wrongs[Math.floor(Math.random()*wrongs.length)];
        wrongs = wrongs.filter((emoji) => emoji !== wrong1);
        const wrong2: string = wrongs[Math.floor(Math.random()*wrongs.length)];
        // 150 is emoji dimention, 20 is отступ
        const answerPositions: Array<Pos> = [{x: 200, y: 300}, {x: 200, y: (300 + 150 + 20)}, {x: 200, y: (300 + 150*2 + 20*2)}];
        const answers: Array<string> = [answer, wrong1, wrong2];
        shuffle(answers);
        const rightNumber: number = answers.indexOf(answer);
        let rightLetter: string = '';

        let delay = 700
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(delay, () => {
                this.answerConstructor(answerPositions[i], this.answerKeysLetters[i], answers[i]);
            });
            if (i == rightNumber) {
                rightLetter = this.answerKeysLetters[i];
            }
            delay += 100;
        };

        for (const letter in letterKeyCodes) {
            const keyCode: number = letterKeyCodes[letter];
            if (this.input.keyboard) {
                if (letter === rightLetter) {
                    console.log(letter);
                    this.rightAnswerKey = this.input.keyboard.addKey(keyCode);
                }
                else if (!this.wrongAnswer1Key) {
                    this.wrongAnswer1Key = this.input.keyboard.addKey(keyCode);
                }
                else {
                    this.wrongAnswer2Key = this.input.keyboard.addKey(keyCode);
                }

            }
        }
    }

    private endDialogue() {
        this.bubblePlayer.setAlpha(0);
        this.bubbleEnemy.setAlpha(0);
        this.emojisImages.clear(false, true);
        this.rightAnswerKey = 0;
        this.wrongAnswer1Key = 0;
        this.wrongAnswer2Key = 0;
        this.dialogueGoing = false;
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0xff00ff);

        // TODO?: move this stuff into config
        const ARCADE_AREA_CENTER: Pos = {
            x: (SCREEN_CENTER.x - 5),
            y: (GAME_HEIGHT/3 + 55)
        }
        const ARCADE_AREA_SIZE = {
            width: 550,
            height: 550
        }
        const ARCADE_AREA_TOP_LEFT_CORNER: Pos = {
            x: ARCADE_AREA_CENTER.x - ARCADE_AREA_SIZE.width/2,
            y: ARCADE_AREA_CENTER.y - ARCADE_AREA_SIZE.height/2
        }

        this.arcadeAreaCoords = { x: ARCADE_AREA_TOP_LEFT_CORNER.x, y: ARCADE_AREA_TOP_LEFT_CORNER.y, width: ARCADE_AREA_SIZE.width, height: ARCADE_AREA_SIZE.height };

        this.layout = this.add.image(SCREEN_CENTER.x, SCREEN_CENTER.y, 'level-layout');

        this.bubbleEnemy = this.add.image((GAME_WIDTH - 200), 400, 'bubble');
        this.bubbleEnemy.setFlipY(true);
        this.bubbleEnemy.setAlpha(0);
        this.bubblePlayer = this.add.image(200, 400, 'bubble');
        this.bubblePlayer.setFlipY(true);
        this.bubblePlayer.setFlipX(true);
        this.bubblePlayer.setAlpha(0);
        this.emojis = ['emoji1', 'emoji2', 'emoji3', 'emoji4'];
        this.qAndA = { 'emoji1': 'emoji2' };
        this.answerKeysLetters = ['O', 'E', 'U'];
        this.emojisImages = this.add.group();

        this.arcadeArea = this.add.rectangle(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y, ARCADE_AREA_SIZE.width, ARCADE_AREA_SIZE.height, 0xcccc33, 1);
        this.arcadeArea.setAlpha(0.5);

        this.blocks = this.physics.add.group({ immovable: true });
        const block1 =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y - 100, 'blue');
        const BLOCK1_SIZE = {
            width: 200,
            height: 30
        }
        block1.setDisplaySize(BLOCK1_SIZE.width, BLOCK1_SIZE.height);
        this.blocks.add(block1);
        const block2 =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, 40, 'blue');
        const BLOCK2_SIZE = {
            width: 550,
            height: 30
        }
        block2.setDisplaySize(BLOCK2_SIZE.width, BLOCK2_SIZE.height);
        this.blocks.add(block2);
        const block3 =  this.physics.add.sprite(ARCADE_AREA_CENTER.x, ARCADE_AREA_CENTER.y + 255, 'blue');
        const BLOCK3_SIZE = {
            width: 550,
            height: 30
        }
        block3.setDisplaySize(BLOCK3_SIZE.width, BLOCK3_SIZE.height);
        this.blocks.add(block3);
        // TODO: get blocks coordinates

        this.hand = this.physics.add.sprite(SCREEN_CENTER.x, SCREEN_CENTER.y + 50, 'hand');
        this.handMoveDirection = Direction.Left;
        this.hand.setVelocityX(-300);

        this.physics.add.collider(this.hand, this.blocks, () => {
            this.scene.start('GameOver');
        });

        this.isLoot = false;
        this.lootCount = 0;
        this.lootScoreMsg = this.add.text(
            100,
            100,
            `${this.lootCount}`,
            {
                fontFamily: 'Eater',
                fontSize: '96px',
                color: '#33ff33'
            }
        );

        this.time.delayedCall(2000, () => {
            this.setupDialogue(this.qAndA, this.emojis);
        });

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
        }
    }

    update()
    {
        // Dialogue answer input
        if (this.rightAnswerKey && this.rightAnswerKey.isDown) {
            this.endDialogue();
            this.timeDialogueEnd = this.time.now;
        }
        if ((this.wrongAnswer1Key && this.wrongAnswer1Key.isDown) || (this.wrongAnswer2Key && this.wrongAnswer2Key.isDown)) {
            this.scene.start('GameOver');
            this.timeDialogueEnd = this.time.now;
        }

        // Spawn dialogue with 2 sec break
        if (!this.dialogueGoing) {
            if (this.time.now > this.timeDialogueEnd) {
                console.log(this.dialogueGoing);
                this.setupDialogue(this.qAndA, this.emojis);
                console.log(this.dialogueGoing);
            }
        }

        // Create LOOT
        if (!this.isLoot) {
            // TODO?: add loot spawn delay?
            const lootPos: Pos = this.getLootRandomPos(this.arcadeAreaCoords);
            this.loot = this.physics.add.sprite(lootPos.x, lootPos.y, 'coins');
            this.isLoot = true;
            this.physics.add.collider(this.loot, this.blocks, () => {
                const lootPos: Pos = this.getLootRandomPos(this.arcadeAreaCoords);
                this.loot.setX(lootPos.x);
                this.loot.setY(lootPos.y);
            });
            this.physics.add.collider(this.loot, this.hand, () => {
                this.loot.destroy();
                this.isLoot = false;
                if (this.hand.body.velocity.x !== 0) {
                    if (this.hand.body.velocity.x > 0) {
                        this.hand.body.setVelocityX(300);
                    }
                    else {
                        this.hand.body.setVelocityX(-300);
                    }

                }
                if (this.hand.body.velocity.y !== 0) {
                    if (this.hand.body.velocity.y > 0) {
                        this.hand.body.setVelocityY(300);
                    }
                    else {
                        this.hand.body.setVelocityY(-300);
                    }

                }
                this.lootCount += 1;
                this.lootScoreMsg.setText(`${this.lootCount}`);
            });
        }

        if (this.hand.x < 400 && this.handMoveDirection == Direction.Left) {
            this.hand.x = 950;
        }
        if (this.hand.x > 880 && this.handMoveDirection == Direction.Right) {
            this.hand.x = 350;
        }

        if (this.cursors.left.isDown) {
            if (this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Left;
                this.hand.setSize(100, 50);
                this.hand.angle = 0;
                this.hand.setFlipX(false);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(-300);
            }
        }
        else if (this.cursors.right.isDown) {
            if (this.handMoveDirection == Direction.Up || this.handMoveDirection == Direction.Down) {
                this.handMoveDirection = Direction.Right;
                this.hand.setSize(100, 50);
                this.hand.angle = 0;
                this.hand.setFlipX(true);
                this.hand.setVelocityY(0);
                this.hand.setVelocityX(300);
            }
        }
        else if (this.cursors.up.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Up;
                this.hand.setSize(50, 100);
                this.hand.angle = 90;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(-300);
            }
        }
        else if (this.cursors.down.isDown) {
            if (this.handMoveDirection == Direction.Left || this.handMoveDirection == Direction.Right) {
                this.handMoveDirection = Direction.Down;
                this.hand.setSize(50, 100);
                this.hand.angle = 270;
                this.hand.setFlipX(false);
                this.hand.setVelocityX(0);
                this.hand.setVelocityY(300);
            }
        }
    }

    shutdown()
    {
        // TODO: cleanup
    }
}

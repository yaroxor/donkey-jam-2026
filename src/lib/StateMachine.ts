// Finite state machine — pattern from Osmose's "Phaser Tutorial Series: FSM"
// (2019, https://github.com/Osmose). See dialogue-states.ts and hand-states.ts
// for concrete State<Names, Args> subclasses.

export abstract class State<Names extends string, Args extends unknown[]> {
    stateMachine!: StateMachine<Names, Args>;

    enter(..._args: Args): void {}
    execute(..._args: Args): void {}
    exit(..._args: Args): void {}
}

export class StateMachine<Names extends string, Args extends unknown[]> {
    private currentState: Names | null = null;

    constructor(
        private readonly initialState: Names,
        private readonly possibleStates: Record<Names, State<Names, Args>>,
        private readonly stateArgs: Args,
    ) {
        for (const key in this.possibleStates) {
            this.possibleStates[key].stateMachine = this;
        }
    }

    step(): void {
        if (this.currentState === null) {
            this.currentState = this.initialState;
            this.possibleStates[this.currentState].enter(...this.stateArgs);
        }
        this.possibleStates[this.currentState].execute(...this.stateArgs);
    }

    transition(newState: Names): void {
        if (this.currentState !== null) {
            this.possibleStates[this.currentState].exit(...this.stateArgs);
        }
        this.currentState = newState;
        this.possibleStates[this.currentState].enter(...this.stateArgs);
    }

    is(state: Names): boolean {
        return this.currentState === state;
    }
}

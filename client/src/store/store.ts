import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// API-сервис для взаимодействия с сервером
export const api = createApi({
    reducerPath: "api",
    baseQuery: fetchBaseQuery({ baseUrl: "http://localhost:3001" }),
    endpoints: (builder) => ({
        createRoom: builder.mutation<{ roomId: string }, void>({
            query: () => ({
                url: "/create-room",
                method: "POST",
            }),
        }),
    }),
});

interface InitialState {
    roomId: string;
    isStarted: boolean;
    nickname: string;
    userId: string;
    isDead: boolean;
    shots: number;
    participants: {
        nickname: string;
        shots: number;
        userId: string;
        isDead: boolean;
    }[];
    cards: { id: string; type: string }[];
    currentTurn: string;
}

const initialState: InitialState = {
    roomId: "",
    isStarted: false,
    nickname: "",
    isDead: false,
    shots: 0,
    userId: "",
    participants: [],
    cards: [],
    currentTurn: "",
};

// Слайс для управления сообщениями в реальном времени
const gameSlice = createSlice({
    name: "game",
    initialState,
    reducers: {
        setNickname: (state, action: PayloadAction<string>) => {
            state.nickname = action.payload;
        },
        joinRoom: (
            state,
            action: PayloadAction<{
                roomId: string;
                isStarted: boolean;
                userId: string;
                participants: {
                    nickname: string;
                    shots: number;
                    userId: string;
                    isDead: boolean;
                }[];
            }>
        ) => {
            state.roomId = action.payload.roomId;
            state.isStarted = action.payload.isStarted;
            state.userId = action.payload.userId;
            state.participants = action.payload.participants;
            state.isDead = false;
            state.shots = 0;
        },
        leaveRoom: (state) => {
            state.roomId = "";
            state.isStarted = false;
            state.nickname = "";
            state.userId = "";
            state.participants = [];
            state.cards = [];
        },
        updateCards: (
            state,
            action: PayloadAction<{ id: string; type: string }[]>
        ) => {
            state.cards = action.payload;
        },
        updateParticipants: (
            state,
            action: PayloadAction<
                Array<{
                    nickname: string;
                    shots: number;
                    userId: string;
                    isDead: boolean;
                }>
            >
        ) => {
            state.participants = action.payload;
        },
        updateCurrentTurn: (state, action: PayloadAction<string>) => {
            state.currentTurn = action.payload;
        },
        startGame: (state) => {
            state.isStarted = true;
        },
        kill: (state) => {
            state.isDead = true;
        },
        shot: (state) => {
            state.shots += 1;
        },
    },
});

// Экспортируем actions и reducer
export const {
    setNickname,
    joinRoom,
    leaveRoom,
    updateCards,
    updateParticipants,
    updateCurrentTurn,
    startGame,
    kill,
    shot,
} = gameSlice.actions;
export const store = configureStore({
    reducer: {
        [api.reducerPath]: api.reducer,
        game: gameSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const { useCreateRoomMutation } = api;

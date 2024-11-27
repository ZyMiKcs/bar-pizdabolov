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
    cardType: string;
    cardsOnTable: number;
    participants: {
        nickname: string;
        shots: number;
        userId: string;
        isDead: boolean;
        isNoCards: boolean;
    }[];
    cards: { id: string; type: string }[];
    currentTurn: string;
    prevTurn: string;
}

const initialState: InitialState = {
    roomId: "",
    isStarted: false,
    cardType: "",
    cardsOnTable: 0,
    nickname: "",
    userId: "",
    participants: [],
    cards: [],
    currentTurn: "",
    prevTurn: "",
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
                    isNoCards: boolean;
                }[];
            }>
        ) => {
            state.roomId = action.payload.roomId;
            state.isStarted = action.payload.isStarted;
            state.userId = action.payload.userId;
            state.participants = action.payload.participants;
        },
        leaveRoom: (state) => {
            state.roomId = "";
            state.isStarted = false;
            state.nickname = "";
            state.userId = "";
            state.participants = [];
            state.cards = [];
            state.currentTurn = "";
            state.prevTurn = "";
            state.cardType = "";
            state.cardsOnTable = 0;
        },
        updateCards: (
            state,
            action: PayloadAction<{ id: string; type: string }[]>
        ) => {
            state.cards = action.payload;
        },
        foldCards: (state, action: PayloadAction<string[]>) => {
            state.cards = state.cards.filter(
                (card) => !action.payload.includes(card.id)
            );
        },
        updateParticipants: (
            state,
            action: PayloadAction<
                Array<{
                    nickname: string;
                    shots: number;
                    userId: string;
                    isDead: boolean;
                    isNoCards: boolean;
                }>
            >
        ) => {
            state.participants = action.payload;
        },
        updateCurrentTurn: (
            state,
            action: PayloadAction<{ prevTurn: string; currentTurn: string }>
        ) => {
            state.currentTurn = action.payload.currentTurn;
            state.prevTurn = action.payload.prevTurn;
        },
        setCardType: (state, action: PayloadAction<string>) => {
            state.cardType = action.payload;
        },
        startGame: (state) => {
            state.isStarted = true;
        },
        setCardsOnTable: (state, action: PayloadAction<number>) => {
            state.cardsOnTable = action.payload;
        },
        resetIsNoCards: (state) => {
            state.participants = state.participants.map((participant) => ({
                ...participant,
                isNoCards: false,
            }));
        },
    },
});

// Экспортируем actions и reducer
export const {
    setNickname,
    joinRoom,
    leaveRoom,
    updateCards,
    foldCards,
    updateParticipants,
    updateCurrentTurn,
    startGame,
    setCardType,
    setCardsOnTable,
    resetIsNoCards,
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

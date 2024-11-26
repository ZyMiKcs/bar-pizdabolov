import { Box, Button, Container, Paper, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import { setNickname, useCreateRoomMutation } from "../../store/store";
import { Link } from "react-router-dom";
import { useDispatch } from "react-redux";

const Home: React.FC = () => {
    const [createRoom, { data, isLoading, isSuccess }] =
        useCreateRoomMutation();
    const dispatch = useDispatch();
    const [nickname, setNick] = useState("");

    useEffect(() => {
        if (isSuccess) {
            dispatch(setNickname(nickname));
        }
    }, [isSuccess]);

    const handleCreateRoom = async () => {
        await createRoom();
    };

    return (
        <Container
            maxWidth="sm"
            sx={{ mt: 4 }}
        >
            <Paper
                elevation={3}
                sx={{ p: 4 }}
            >
                <Typography
                    variant="h4"
                    align="center"
                    gutterBottom
                >
                    Welcome to the Chat App
                </Typography>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body1">
                        Enter your nickname:
                    </Typography>
                    <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNick(e.target.value)}
                        placeholder="Nickname"
                        style={{
                            width: "100%",
                            padding: "8px",
                            marginBottom: "16px",
                        }}
                    />
                </Box>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleCreateRoom}
                    disabled={isLoading || !nickname}
                    fullWidth
                    sx={{ mb: 2 }}
                >
                    Create Room
                </Button>
                {data && (
                    <Box>
                        <Typography variant="body1">
                            Share this link with others to join the room:
                        </Typography>
                        <Typography
                            variant="h6"
                            color="secondary"
                            gutterBottom
                        >
                            /room/{data.roomId}
                        </Typography>
                        <Button
                            component={Link}
                            to={`/room/${data.roomId}`}
                            variant="outlined"
                            fullWidth
                        >
                            Join Room
                        </Button>
                    </Box>
                )}
            </Paper>
        </Container>
    );
};

export default Home;

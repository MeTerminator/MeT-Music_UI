import axios from "@/utils/request";


export const getMusicUrl = (mid, music_quality) => {
    return axios({
        method: "GET",
        url: "/extra/music/url",
        params: {
            mid,
            music_quality,
            timestamp: new Date().getTime(),
        },
    });
};

export const getMusicInfo = (mid) => {
    return axios({
        method: "GET",
        url: "/extra/music/info",
        params: {
            mids: mid,
        },
    });
};

export const getComments = (songID, page, pageSize, last_seq_no) => {
    return axios({
        method: "GET",
        url: "/extra/music/comments",
        params: {
            songID,
            page,
            pageSize,
            last_seq_no,
        },
    });
};

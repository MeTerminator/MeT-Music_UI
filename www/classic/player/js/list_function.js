
//对象获取
function dom(id){
	return document.getElementById(id);
};

// 判断是否是移动设备
var isMobile = {  
    Android: function() {  
        return navigator.userAgent.match(/Android/i) ? true : false;  
    },  
    BlackBerry: function() {  
        return navigator.userAgent.match(/BlackBerry/i) ? true : false;  
    },  
    iOS: function() {  
        return navigator.userAgent.match(/iPhone|iPad|iPod/i) ? true : false;  
    },  
    Windows: function() {  
        return navigator.userAgent.match(/IEMobile/i) ? true : false;  
    },  
    any: function() {
        return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Windows());  
    }
};


var isMobile = isMobile.any(); // 判断是否是移动设备
var search = false;  //是否已经搜索
var mainList = ""; //滚动条

var stopTag = "<span class='list-icon icon-play icon-stops' data-function='stop' title='暂停'></span>";
var playTag = "<span class='list-icon icon-play' data-function='play' title='播放'></span>";

// 列表中的菜单点击
$(".music-list").on("click",".icon-play,.icon-download,.icon-share", function() {
    
    switch($(this).data("function")) {
        case "play": // 播放
        	//如果当前地址为空，或者点击的歌曲与当前不一样或者处于搜索后第一次点击播放，那么选择当前点击的歌曲播放
        	var flag = krAudio.Currentplay == $(this).parents(".list-item").index() ? false : true;
        	if(isEmpty(krAudio.audioDom.src) || flag || search){
        		krAudio.Currentplay = $(this).parents(".list-item").index();//当前播放的音乐序号
        		listMenuStyleChange(krAudio.Currentplay);  //列表菜单的播放暂停按钮的变换
				krAudio.seturl();
				krAudio.play();
        	}
        	else palystop(); //否则，默认执行播放和暂停

        	break;
        case "stop":
        	palystop();  //默认执行播放和暂停
        	break;
        case "download":    // 下载
        	var url = $(this).parents(".list-item").data("url");
        	var title = $(this).parents(".list-item").find(".music-name-cult").text();
            thisDownload(url,title);
        	break;
    }
    return true;
});

//如果是移动端，那么滚动条操作对象就是不变的
if(isMobile) {  
    mainList = $("#main-list");
} else {
    // 滚动条初始化(只在非移动端启用滚动条控件)
    $("#main-list").mCustomScrollbar({
        theme:"minimal",
        advanced:{
            updateOnContentResize: true // 数据更新后自动刷新滚动条
        }
    });
    
    mainList = $("#main-list .mCSB_container");  
}


//初始化追加列表小菜单
function appendlistMenu(){
	$(".list-item").each(function(index,el) {
	    var target = $(el).find(".music-name");
	    var html = '<span class="music-name-cult">' + 
	    target.html() + 
	    '</span>' +
	    '<div class="list-menu">' +
	        '<span class="list-icon icon-play" data-function="play" title="播放"></span>' +
	        '<span class="list-icon icon-download" data-function="download" title="下载"></span>'
	    '</div>';
	    target.html(html);
	});
}


//列表菜单的播放暂停按钮的变换 当前点击变换成暂停样式，其他都是播放样式
function listMenuStyleChange(Currindex){
	search = false;  //搜索标志结束
	var currobj = $("#main-list .list-item").eq(Currindex-1); //获取当前播放对象
	//其他全部变成播放样式,用 not 过滤掉当前元素 
	$(".list-item").not(currobj).each(function(index,el) {
		$(el).find(".icon-play").replaceWith(playTag);
	});
    //自己变成暂停样式
	currobj.find(".icon-play").replaceWith(stopTag);
}


// 移动端列表项单击播放
function mobileClickPlay(){
    if(isMobile) {
    	search = false;  //搜索标志结束
        krAudio.Currentplay = $(this).index();//当前播放的音乐序号
		krAudio.seturl();
		krAudio.play();
    }
}

//点击右下方的下载按钮
$(".btn-download").click(function(){
	//如果未选择音乐，不能下载
	if(krAudio.Currentplay == 0){
		loading("选择播放的歌曲哦~",5);
		return;	
	} 
	var obj = $("#main-list .list-item").eq(krAudio.Currentplay-1); //当前播放对象
	var url = obj.data("url");
	var title = obj.find(".music-name-cult").text();
    thisDownload(url,title);
});

// 下载正在播放的这首歌
function thisDownload(url,title) {
	//下载
	var eledow = dom("downabo");
	eledow.setAttribute("href",url);
	eledow.setAttribute("download",title+".mp3");
	eledow.click();
}

// 移动端顶部按钮点击处理
$(".btn").click(function(){
    switch($(this).data("action")) {
        case "player":    // 播放器
            dataBox("player");
        break;
        case "list": // 播放列表
            dataBox("list"); // 显示正在播放列表
        break;
    }
});

// 移动端选择顶部栏要显示的信息
// 参数：要显示的信息（list、player）
function dataBox(choose) {
    $('.btn-box .active').removeClass('active');
    switch(choose) {
        case "list":    // 显示播放列表
            if($(".btn[data-action='player']").css('display') !== 'none') {
                $("#player").hide();
            } else if ($("#player").css('display') == 'none') {
                $("#player").fadeIn();
            }
            $("#main-list").fadeIn();
            $("#sheet").fadeOut();
            $(".serchsongs").show(); //搜索栏显示
            $(".btn[data-action='list']").addClass('active');
            
        break;
        case "player":  // 显示播放器
            $("#player").fadeIn();
            $("#sheet").fadeOut();
            $("#main-list").fadeOut();
            $(".serchsongs").hide();  //搜索栏隐藏
            $(".btn[data-action='player']").addClass('active');
        break;
    }
}

/* 初始化背景根据图片虚化效果 */
function initblurImgs(){
	if(isMobile) {  // 移动端采用另一种模糊方案
        $('#blur-img').html('<div class="blured-img" id="mobile-blur"></div><div class="blur-mask mobile-mask"></div>');
    } else {
        // 背景图片初始化
        $('#blur-img').backgroundBlur({
            //imageURL : imageURL, // URL to the image that will be used for blurring
            blurAmount : 50, // 模糊度
            imageClass : 'blured-img', // 背景区应用样式
            overlayClass : 'blur-mask', // 覆盖背景区class，可用于遮罩或额外的效果
            duration: 1000, // 图片淡出时间
            endOpacity : 1 // 图像最终的不透明度
        });
    }
    
    $('.blur-mask').fadeIn(1000);   // 遮罩层淡出
}

/* 更换背景图片，动画效果 */
function blurImages(img){
	var animate = false;
	var imgload = false;
	if(isMobile){    
        $("#music-cover").load(function(){
            $("#mobile-blur").css('background-image', 'url("' + img + '")');
        });
    }  //PC端封面
    else if(!isMobile){ 
        $("#music-cover").load(function(){
            if(animate) {   // 渐变动画也已完成
                $("#blur-img").backgroundBlur(img);    // 替换图像并淡出
                $("#blur-img").animate({opacity:"1"}, 1500); // 背景更换特效
            } else {
                imgload = true;     // 告诉下面的函数，图片已准备好
            }
            
        });
        
        // 渐变动画
        $("#blur-img").animate({opacity: "0.2"}, 1000, function(){
            if(imgload) {   // 如果图片已经加载好了
                $("#blur-img").backgroundBlur(img);    // 替换图像并淡出
                $("#blur-img").animate({opacity:"1"}, 1500); // 背景更换特效
            } else {
                animate = true;     // 等待图像加载完
            }
        });
    }
}

// 图片加载失败处理
$('img').error(function(){
    $(this).attr('src', 'images/player_cover.png');
});


//判断非空
function isEmpty(val) {
	val = $.trim(val);
	if (val == null)
		return true;
	if (val == undefined || val == 'undefined')
		return true;
	if (val == "")
		return true;
	if (val.length == 0)
		return true;
	if (!/[^(^\s*)|(\s*$)]/.test(val))
		return true;
	return false;
}

/* 处理返回的json数据用了一点es6的语法 */
function indexSong() {
    // 1. 获取当前页面 URL 中的 tid 参数
    const urlParams = new URLSearchParams(window.location.search);
    const tid = urlParams.get('tid');

    // 2. 如果不存在 tid，则返回空（或者进行提示）
    if (!tid) {
        console.warn("无 tid 参数");
        return; 
    }

    var count = 1;
    loading("加载中...", 500);

    $.ajax({
        // 3. 动态拼接 tid
        url: `/api/v1/songlist/url?tid=${tid}`,
        type: 'GET',
        dataType: 'json',
        success: function(data) {
            // 如果后端返回数据为空或不是数组，防御性处理
            if (!data || !Array.isArray(data)) {
                mainList.html('<div class="list-item text-center">暂无歌曲数据</div>');
                tzUtil.animates($("#tzloading"), "slideUp");
                return;
            }

            var html = `<div class="listitems list-head">
                            <span class="music-album">专辑</span>
                            <span class="auth-name">歌手</span>
                            <span class="music-name">歌曲</span>
                        </div>`;
            
            data.forEach(function(item) {
                // 使用模板字符串优化拼接
                item.lrc = `/api/v1/lrc?mid=${item.songmid}`;
                html += `<div class="list-item" data-url="${item.url}" data-pic="${item.pic}" data-mid="${item.mid}" data-lrc="${item.lrc}">
                            <span class="list-num">${count}</span>
                            <span class="list-mobile-menu"></span>
                            <span class="music-album">${item.album}</span>
                            <span class="auth-name">${item.author}</span>
                            <span class="music-name">${item.title}</span>
                        </div>`;
                count++;
            });

            html += `<div class="list-item text-center" title="全部加载完了哦~" id="list-foot">全部加载完了哦~</div>`;
            mainList.html(html);
            
            // 后续逻辑保持不变
            listToTop();
            tzUtil.animates($("#tzloading"), "slideUp");
            krAudio.allItem = mainList.children('.list-item').length - 1;
            appendlistMenu();
            mainList.find(".list-item").click(mobileClickPlay);
            $(".list-mobile-menu").click(mobileListMenu);
        },
        error: function() {
            loading("加载失败，请稍后重试。", 5);
            tzUtil.animates($("#tzloading"), "slideUp");
        }
    });
}



/* 更据关键词搜索，处理返回的json数据用了一点es6的语法 接入qq音乐搜索 */
function searchSong(keywords) {
    $("#krserwords").blur();
    var count = 1;
    loading("搜索中...", 500);
    var matchedItems = [];
    $("#main-list .list-item").each(function() {
        var title = $(this).find(".music-name-cult").text().toLowerCase();
        var artist = $(this).find(".auth-name").text().toLowerCase();
        if (title.includes(keywords.toLowerCase()) || artist.includes(keywords.toLowerCase())) {
            matchedItems.push($(this).clone());
        }
    });

    if (matchedItems.length === 0) {
        loading("未找到匹配的歌曲。", 5);
        return;
    }

    var html = `<div class="listitems list-head">
                    <span class="music-album">专辑</span>
                    <span class="auth-name">歌手</span>
                    <span class="music-name">歌曲</span>
                </div>`;
    matchedItems.forEach(function(item) {
        item.find(".list-num").text(count);
        html += item.prop('outerHTML');
        count++;
    });
    html += `<div class="list-item text-center" title="全部加载完了哦~" id="list-foot">全部加载完了哦~</div>`;
    mainList.html(html);
    search = true;
    listToTop();
    tzUtil.animates($("#tzloading"), "slideUp");
    krAudio.allItem = mainList.children('.list-item').length - 1;
    appendlistMenu();
    mainList.find(".list-item").click(mobileClickPlay);
    $(".list-mobile-menu").click(mobileListMenu);
}


// 播放列表滚动到顶部
function listToTop() {
	if(isMobile) $("#main-list").animate({scrollTop: 0}, 200);
    else $("#main-list").mCustomScrollbar("scrollTo", 0, "top");
}


/* 点击搜索按钮或者在文本框回车搜索 */
$(".searchDivIcon").click(function() {
	var keywords = $("#krserwords").val();
	if(isEmpty(keywords)) return;
	searchSong(keywords);//进行搜索
});

$("#krserwords").keyup(function(event){
	var keywords = $("#krserwords").val();
	if(event.keyCode ==13){
		if(isEmpty(keywords)) return;
		searchSong(keywords);//进行搜索
	}
});

//当前播放歌曲的详细信息的按钮点击
$("#music-info").click(function(){
	if(isEmpty(krAudio.audioDom.src)) {
		loading("选择播放的歌曲哦~",5);
	}else{
		musicInfo(krAudio.Currentplay-1);
	}
});

//移动端的每首歌点击详细信息的按钮
function mobileListMenu(){
	var index = $(this).parents(".list-item").index();
	musicInfo(index-1);
	//取消冒泡，防止点击播放
	return false;
};

// 展现系统列表中任意首歌的歌曲信息（或者当前歌曲）
function musicInfo(index) {
    var currentObject = $("#main-list .list-item").eq(index); //获取点击的对象
    var title = currentObject.find(".music-name-cult").text();
    var url = currentObject.data("url");
    var lrc = currentObject.data("lrc");
    var tempStr = `<span class="info-title">歌曲：</span> ${title}
				    <br><span class="info-title">歌手：</span> ${currentObject.find(".auth-name").text()}
				    <br><span class="info-title">专辑：</span> ${currentObject.find(".music-album").text()}`;
    
    tempStr += `<br><span class="info-title">链接：</span>
    		<span class="info-btn" id="info-songs" data-text="${url}">歌曲&nbsp;&nbsp;</span>
    		<span class="info-btn" id="info-lrcs" data-text="${lrc}">歌词</span><br>
    		<span class="info-title">操作：</span>
    		<span class="info-btn" onclick="thisDownload('${url}','${title}')">下载</span>`;
    
    layer.open({
        type: 0,
        closeBtn:0,
        shadeClose:true,
        title: false, //不显示标题
        btn: false,
        skin :'mylayerClass',
        content: tempStr
    });
    /* 实现点击复制歌曲链接、歌词链接 */
    zclips("#info-songs");
	zclips("#info-lrcs");
}

/* 实现点击复制歌曲链接、歌词链接 */
function zclips(obj){
	var clipboard = new ClipboardJS(obj, {
        text: function() {
            return $(obj).data("text");
        }
    });

	clipboard.on('success', function(e) {
        loading("复制成功",3);
    });

	clipboard.on('error', function(e) {
        loading("复制失败",3);
    });
}


// --- 隔空播放 (Airplay Receiver) 逻辑 ---

let airplaySongCache = {};
let lastSongMid = null;

function checkAndInitAirplayReceiver() {
    const urlParams = new URLSearchParams(window.location.search);
    const sid = urlParams.get('sid');
    if (sid) {
        console.log("[Airplay] Init airplay mode with SessionId:", sid);
        initAirplayReceiver(sid);
    }
}

function initAirplayReceiver(sid) {
    let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${wsProtocol}//${window.location.host}/api/ws/client`;
    
    let socket = new WebSocket(wsUrl);
    
    socket.onopen = function() {
        console.log("[Airplay WS] Connected to airplay server");
        // Subscribe to sid
        socket.send(JSON.stringify({
            "type": "listen",
            "SessionId": [sid]
        }));
    };
    
    socket.onmessage = function(event) {
        try {
            let msg = JSON.parse(event.data);
            if (msg.type === "feedback" && msg.SessionId === sid) {
                let data = msg.data;
                handleAirplayCommand(data);
            }
        } catch(e) {
            console.error("[Airplay WS] Error parsing message", e);
        }
    };
    
    socket.onclose = function() {
        console.log("[Airplay WS] Disconnected. Reconnecting in 3s...");
        setTimeout(() => {
            initAirplayReceiver(sid);
        }, 3000);
    };
    
    socket.onerror = function(err) {
        console.error("[Airplay WS] Error", err);
    };
}

function handleAirplayCommand(data) {
    let songMid = data.songMid;
    if (!songMid) return;
    
    let event = data.event;
    let isPlaying = data.status;
    let currentTime = data.currentTime;
    let systemTime = data.systemTime;
    
    if (songMid !== lastSongMid) {
        lastSongMid = songMid;
        playAirplaySong(songMid, function() {
            syncPlaybackState(isPlaying, currentTime, systemTime);
        });
    } else {
        syncPlaybackState(isPlaying, currentTime, systemTime);
    }
}

function syncPlaybackState(isPlaying, currentTime, systemTime) {
    let latency = 0;
    if (systemTime) {
        latency = (Date.now() - systemTime) / 1000.0;
        if (latency < 0 || latency > 5.0) latency = 0;
    }
    let targetTime = currentTime + latency;
    
    if (isPlaying) {
        if (krAudio.audioDom.paused) {
            krAudio.play();
        }
        let diff = Math.abs(krAudio.audioDom.currentTime - targetTime);
        if (diff > 2.0) {
            krAudio.audioDom.currentTime = targetTime;
            if (typeof refreshLyric === "function") {
                refreshLyric(targetTime);
            }
        }
    } else {
        if (!krAudio.audioDom.paused) {
            krAudio.stop();
        }
        let diff = Math.abs(krAudio.audioDom.currentTime - currentTime);
        if (diff > 1.0) {
            krAudio.audioDom.currentTime = currentTime;
            if (typeof refreshLyric === "function") {
                refreshLyric(currentTime);
            }
        }
    }
}

function playAirplaySong(songMid, onLoaded) {
    let $existing = $(`#main-list .list-item[data-mid="${songMid}"]`);
    if ($existing.length > 0) {
        let idx = $("#main-list .list-item").index($existing) + 1;
        krAudio.Currentplay = idx;
        listMenuStyleChange(krAudio.Currentplay);
        krAudio.changeURL = true;
        
        let url = $existing.data("url");
        krAudio.audioDom.src = url;
        
        // Trigger page info updates
        var pic = $existing.data("pic");
        $("#music-cover").attr("src", pic);
        blurImages(pic);
        var music_title = $existing.find(".music-name").text();
        var author = $existing.find(".auth-name").text();
        $(".progress_msg .music_title").text(music_title + " - " + author);
        $(document).attr("title", music_title + " - " + author);
        var lrcSrc = $existing.data("lrc");
        if (typeof lyricCallback === "function") {
            lyricCallback(lrcSrc);
        }

        if (onLoaded) onLoaded();
        return;
    }

    if (airplaySongCache[songMid]) {
        addAirplaySongToDom(airplaySongCache[songMid]);
        playAirplaySong(songMid, onLoaded);
        return;
    }

    loading("同步切歌中...", 500);
    $.ajax({
        url: `/api/v1/song/url?mid=${songMid}`,
        type: 'GET',
        dataType: 'json',
        success: function(res) {
            if (res && res.data && res.data[0]) {
                let track = res.data[0].track_info;
                let singers = (track.singer || []).map(s => s.name || s.title || "").join(' / ');
                let albumName = track.album ? (track.album.name || track.album.title || "") : "";
                let pmid = track.album ? (track.album.pmid || track.album.mid || "") : "";
                let pic = pmid ? `https://y.qq.com/music/photo_new/T002R300x300M000${pmid}.jpg` : "";
                
                let songObj = {
                    mid: songMid,
                    url: res.data[0].url,
                    pic: pic,
                    album: albumName,
                    author: singers,
                    title: track.title,
                    lrc: `/api/v1/lrc?mid=${songMid}`
                };
                airplaySongCache[songMid] = songObj;
                addAirplaySongToDom(songObj);
                playAirplaySong(songMid, onLoaded);
            }
            tzUtil.animates($("#tzloading"), "slideUp");
        },
        error: function() {
            console.error("Failed to load airplay song");
            tzUtil.animates($("#tzloading"), "slideUp");
        }
    });
}

function addAirplaySongToDom(song) {
    let count = $("#main-list .list-item").length;
    $("#list-foot").remove();
    
    let html = `<div class="list-item" data-url="${song.url}" data-pic="${song.pic}" data-mid="${song.mid}" data-lrc="${song.lrc}">
                    <span class="list-num">${count}</span>
                    <span class="list-mobile-menu"></span>
                    <span class="music-album">${song.album}</span>
                    <span class="auth-name">${song.author}</span>
                    <span class="music-name">${song.title}</span>
                </div>`;
    
    $("#main-list").append(html);
    $("#main-list").append(`<div class="list-item text-center" title="全部加载完了哦~" id="list-foot">全部加载完了哦~</div>`);
    
    krAudio.allItem = $("#main-list .list-item").length - 1;
    appendlistMenu();
    
    $("#main-list .list-item").last().click(mobileClickPlay);
    $("#main-list .list-item").last().find(".list-mobile-menu").click(mobileListMenu);
}




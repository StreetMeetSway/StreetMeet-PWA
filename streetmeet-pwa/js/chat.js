/* ============================================================
   STREETMEET — CHAT MODULE
   AIM-style community chat boards
   ============================================================ */

const SM = window.SM = window.SM || {};

SM.chatRooms = {
  smdc: {
    label: '#smdc-general — StreetMeet DC',
    onlineCount: '14',
    messages: [
      { sys: true, text: '*** Welcome to #smdc-general. Be respectful. Create dope content. ***' },
      { sender: 'k3vinwayne', host: true, text: 'Next meet is at Adams Morgan. Come through!' },
      { sender: 'devantecapers', host: true, text: 'Golden hour hits around 7:30. Bring your wide glass.' },
      { sender: 'jordanm', text: "Already RSVP'd. Can't wait." },
      { sender: 'tashar', text: 'First time coming — what should I expect?' },
      { sender: 'k3vinwayne', host: true, text: 'Just show up ready to connect and create. No pressure.' },
    ],
    users: [
      { name: 'k3vinwayne', host: true, online: true },
      { name: 'devantecapers', host: true, online: true },
      { name: 'jordanm', online: true },
      { name: 'tashar', online: true },
      { name: 'micaelb', online: true },
      { name: 'lenapr', online: false },
      { name: 'swaysview', online: false },
    ]
  },
  smwa: {
    label: '#smwa-general — StreetMeet WA',
    onlineCount: '9',
    messages: [
      { sys: true, text: '*** Welcome to #smwa-general. Rain or shine, we shoot. ***' },
      { sender: 'pacificleo', host: true, text: 'Next meet in Capitol Hill, first Saturday of the month!' },
      { sender: 'seattleshooter', text: "Bringing my Fuji X100V. So ready." },
      { sender: 'rainierrach', text: 'Can we do a fog shoot near the waterfront?' },
      { sender: 'pacificleo', host: true, text: "Love that idea. Let's make it happen!" },
    ],
    users: [
      { name: 'pacificleo', host: true, online: true },
      { name: 'seattleshooter', online: true },
      { name: 'rainierrach', online: true },
      { name: 'pnwframes', online: false },
    ]
  },
  smmd: {
    label: '#smmd-general — StreetMeet MD',
    onlineCount: '7',
    messages: [
      { sys: true, text: '*** Welcome to #smmd-general. DMV represent. ***' },
      { sender: 'baltframes', host: true, text: 'Inner Harbor shoot coming up. Stay tuned!' },
      { sender: 'crabcakecam', text: "Can't wait! Baltimore streets are so underrated." },
      { sender: 'mdcreates', text: 'Bringing my model friends from DMV!' },
    ],
    users: [
      { name: 'baltframes', host: true, online: true },
      { name: 'crabcakecam', online: true },
      { name: 'mdcreates', online: false },
    ]
  }
};

SM.currentRoom = 'smdc';
SM.chatMessageData = {};

SM.initChat = function() {
  Object.keys(SM.chatRooms).forEach(room => {
    SM.chatMessageData[room] = [...SM.chatRooms[room].messages];
  });
};

SM.renderChatRoom = function(roomId) {
  SM.currentRoom = roomId;
  const room = SM.chatRooms[roomId];
  const msgs = SM.chatMessageData[roomId];

  const labelEl = document.getElementById('chat-room-label');
  const onlineEl = document.getElementById('chat-online-count');
  const msgsEl = document.getElementById('chat-messages');
  const usersEl = document.getElementById('chat-users-list');

  if (labelEl) labelEl.textContent = room.label;
  if (onlineEl) onlineEl.textContent = room.onlineCount + ' online';

  if (msgsEl) {
    msgsEl.innerHTML = '';
    msgs.forEach(m => {
      const div = document.createElement('div');
      div.className = 'chat-msg';
      if (m.sys) {
        div.innerHTML = `<span class="sys">${m.text}</span>`;
      } else {
        div.innerHTML = `<span class="sender${m.host ? ' host' : ''}">${m.sender}:</span> ${m.text}`;
      }
      msgsEl.appendChild(div);
    });
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  if (usersEl) {
    usersEl.innerHTML = '';
    room.users.forEach(u => {
      const div = document.createElement('div');
      div.className = 'chat-user';
      div.innerHTML = `
        <div class="chat-user-dot${u.online ? '' : ' away'}"></div>
        <div class="chat-user-name">${u.name}</div>
        ${u.host ? '<div class="chat-user-badge">HOST</div>' : ''}
      `;
      usersEl.appendChild(div);
    });
  }

  document.querySelectorAll('.chat-room-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.room === roomId);
  });
};

SM.sendChatMessage = function() {
  const input = document.getElementById('chat-input');
  const user = SM.getCurrentUser();
  if (!input || !user) return;
  const text = input.value.trim();
  if (!text) return;
  const msg = {
    sender: (user.firstName + user.lastInitial.replace('.', '')).toLowerCase(),
    host: SM.isHost(),
    text: text
  };
  SM.chatMessageData[SM.currentRoom].push(msg);
  SM.renderChatRoom(SM.currentRoom);
  input.value = '';
};

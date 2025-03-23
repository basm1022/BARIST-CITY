const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, PermissionsBitField, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Bot configuration
const config = {
  token: 'MTM1MDg4MTMwNjAwNzA0ODMxMw.GDetAP.ifgy_LZ_7a9kmq4QqJZODMK8ULPjx_231dUGDk',
  prefix: '!',
  database: 'tickets.json'
};

// Initialize the client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// Database initialization
let db = {
  tickets: [],
  categories: [],
  stats: {},
  settings: {}
};

// Load database from file if it exists
if (fs.existsSync(path.join(__dirname, config.database))) {
  try {
    db = JSON.parse(fs.readFileSync(path.join(__dirname, config.database)));
  } catch (error) {
    console.error('Error loading database:', error);
  }
}

// Save database to file
function saveDatabase() {
  try {
    fs.writeFileSync(path.join(__dirname, config.database), JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

// Bot ready event
client.once('ready', () => {
  console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

// Message event handler
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Setup ticket command
  if (command === 'setupticket') {
    // Check if user has admin permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('عذراً، ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    try {
      await setupTicketSystem(message, args);
    } catch (error) {
      console.error('Error in setupticket command:', error);
      message.reply('حدث خطأ أثناء إعداد نظام التذاكر.');
    }
  }

  // Admin stats command
  if (command === 'ticketstats') {
    // Check if user has admin permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('عذراً، ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    try {
      await showTicketStats(message, args);
    } catch (error) {
      console.error('Error in ticketstats command:', error);
      message.reply('حدث خطأ أثناء عرض إحصائيات التذاكر.');
    }
  }

  // Top tickets handlers command
  if (command === 'toptickets') {
    // Check if user has admin permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('عذراً، ليس لديك صلاحية لاستخدام هذا الأمر.');
    }

    try {
      await showTopTicketHandlers(message);
    } catch (error) {
      console.error('Error in toptickets command:', error);
      message.reply('حدث خطأ أثناء عرض قائمة أكثر المشرفين استلاماً للتذاكر.');
    }
  }
});

// Function to setup ticket system
async function setupTicketSystem(message, args) {
  // Create collector for the setup process
  const filter = m => m.author.id === message.author.id;
  const collector = message.channel.createMessageCollector({ filter, time: 300000 }); // 5 minutes timeout
  
  let step = 1;
  let setupData = {
    categoryId: '',
    channelId: '',
    buttonLabel: '',
    bannerUrl: '',
    description: '',
    emoji: '',
    adminRoles: [],
    useMenu: false
  };
  
  // Send initial setup message
  await message.reply('بدء إعداد نظام التذاكر. الخطوة 1: أدخل معرف فئة القنوات (Category ID) أو اكتب "بوت" ليختار البوت الفئة تلقائياً.');
  
  // Handle messages for setup
  collector.on('collect', async (msg) => {
    const content = msg.content.trim();
    
    if (content.toLowerCase() === 'إلغاء') {
      collector.stop('cancelled');
      return;
    }
    
    switch (step) {
      case 1: // Category selection
        if (content.toLowerCase() === 'بوت') {
          // Bot selects category automatically (first category in guild)
          const categories = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
          if (categories.size > 0) {
            setupData.categoryId = categories.first().id;
            await msg.reply(`تم اختيار الفئة: ${categories.first().name} (${setupData.categoryId})`);
          } else {
            await msg.reply('لم يتم العثور على أي فئة في السيرفر. الرجاء إنشاء فئة أولاً.');
            collector.stop('no-categories');
            return;
          }
        } else {
          // User provides category ID
          const category = message.guild.channels.cache.get(content);
          if (!category || category.type !== ChannelType.GuildCategory) {
            await msg.reply('معرف الفئة غير صالح. الرجاء إدخال معرف صحيح أو كتابة "بوت".');
            return; // Don't increment step
          }
          setupData.categoryId = content;
          await msg.reply(`تم اختيار الفئة: ${category.name}`);
        }
        step++;
        await msg.reply('الخطوة 2: أدخل معرف القناة التي سيتم فيها إرسال رسالة إنشاء التذاكر.');
        break;
        
      case 2: // Channel selection
        const channel = message.guild.channels.cache.get(content);
        if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
          await msg.reply('معرف القناة غير صالح. الرجاء إدخال معرف صحيح.');
          return; // Don't increment step
        }
        setupData.channelId = content;
        step++;
        await msg.reply('الخطوة 3: أدخل نص زر إنشاء التذكرة.');
        break;
        
      case 3: // Button label
        setupData.buttonLabel = content;
        step++;
        await msg.reply('الخطوة 4: أدخل رابط البانر (صورة) أو اكتب "لا" لتخطي هذه الخطوة.');
        break;
        
      case 4: // Banner URL - THIS WAS THE ISSUE, IT WAS LABELED AS STEP 5 BEFORE
        if (content.toLowerCase() !== 'لا') {
          if (content.startsWith('http') && (content.endsWith('.png') || content.endsWith('.jpg') || content.endsWith('.jpeg') || content.endsWith('.gif'))) {
            setupData.bannerUrl = content;
          } else {
            await msg.reply('الرابط غير صالح. الرجاء إدخال رابط صورة صالح أو اكتب "لا".');
            return; // Don't increment step
          }
        }
        step++;
        await msg.reply('الخطوة 5: هل تريد استخدام قائمة منسدلة أم أزرار؟ اكتب "منيو" أو "أزرار".');
        break;
        
      case 5: // Menu or buttons - CHANGED FROM 6 TO 5
        if (content.toLowerCase() === 'منيو') {
          setupData.useMenu = true;
        } else if (content.toLowerCase() === 'أزرار') {
          setupData.useMenu = false;
        } else {
          await msg.reply('خيار غير صالح. الرجاء كتابة "منيو" أو "أزرار".');
          return; // Don't increment step
        }
        step++;
        await msg.reply('الخطوة 6: أدخل وصف التذكرة.');
        break;
        
      case 6: // Ticket description - CHANGED FROM 7 TO 6
        setupData.description = content;
        step++;
        await msg.reply('الخطوة 7: أدخل إيموجي التذكرة. (مثال: 🎫)');
        break;
        
      case 7: // Ticket emoji - CHANGED FROM 8 TO 7
        setupData.emoji = content;
        step++;
        await msg.reply('الخطوة 8: أدخل معرفات رتب الإدارة (مفصولة بمسافة) التي يمكنها التعامل مع التذاكر.');
        break;
        
      case 8: // Admin roles - CHANGED FROM 9 TO 8
        const roleIds = content.split(' ');
        const validRoles = [];
        
        for (const roleId of roleIds) {
          const role = message.guild.roles.cache.get(roleId);
          if (role) {
            validRoles.push(roleId);
          }
        }
        
        if (validRoles.length === 0) {
          await msg.reply('لم يتم العثور على أي رتب صالحة. الرجاء إدخال معرفات رتب صحيحة.');
          return; // Don't increment step
        }
        
        setupData.adminRoles = validRoles;
        
        // Save to database
        const categoryId = setupData.categoryId;
        db.categories.push({
          id: categoryId,
          channelId: setupData.channelId,
          buttonLabel: setupData.buttonLabel,
          bannerUrl: setupData.bannerUrl,
          description: setupData.description,
          emoji: setupData.emoji,
          adminRoles: setupData.adminRoles,
          useMenu: setupData.useMenu
        });
        
        // Save settings
        db.settings[message.guild.id] = {
          latestCategory: categoryId
        };
        
        saveDatabase();
        
        // Create and send ticket panel
        await createTicketPanel(message.guild, setupData);
        
        await msg.reply('تم إكمال إعداد نظام التذاكر بنجاح!');
        collector.stop('completed');
        break;
    }
  });
  
  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      message.reply('انتهت مهلة الإعداد. الرجاء المحاولة مرة أخرى.');
    } else if (reason === 'cancelled') {
      message.reply('تم إلغاء عملية الإعداد.');
    } else if (reason === 'no-categories') {
      // Already handled above
    }
  });
}
// Function to create and send ticket panel
async function createTicketPanel(guild, setupData) {
  const channel = guild.channels.cache.get(setupData.channelId);
  if (!channel) return;
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`${setupData.emoji} نظام التذاكر`)
    .setDescription(setupData.description)
    .setColor('#2f3136');
  
  if (setupData.bannerUrl) {
    embed.setImage(setupData.bannerUrl);
  }
  
  // Create button
  const button = new ButtonBuilder()
    .setCustomId(`createticket_${setupData.categoryId}`)
    .setLabel(setupData.buttonLabel)
    .setStyle(ButtonStyle.Primary)
    .setEmoji(setupData.emoji);
  
  const row = new ActionRowBuilder().addComponents(button);
  
  // Send message with embed and button
  await channel.send({ embeds: [embed], components: [row] });
}

// Handle button interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
  
  // Handle ticket creation
  if (interaction.customId.startsWith('createticket_')) {
    const categoryId = interaction.customId.split('_')[1];
    await createTicket(interaction, categoryId);
  }
  
  // Handle ticket management buttons
  if (interaction.customId === 'claim_ticket') {
    await claimTicket(interaction);
  }
  
  if (interaction.customId === 'unclaim_ticket') {
    await unclaimTicket(interaction);
  }
  
  if (interaction.customId === 'call_member') {
    await callMember(interaction);
  }
});

// Function to create a ticket
async function createTicket(interaction, categoryId) {
  await interaction.deferReply({ ephemeral: true });
  
  const categoryConfig = db.categories.find(c => c.id === categoryId);
  if (!categoryConfig) {
    return interaction.editReply({ content: 'حدث خطأ في نظام التذاكر. الرجاء إبلاغ الإدارة.', ephemeral: true });
  }
  
  const guild = interaction.guild;
  const category = guild.channels.cache.get(categoryId);
  
  if (!category) {
    return interaction.editReply({ content: 'فئة التذاكر غير موجودة. الرجاء إبلاغ الإدارة.', ephemeral: true });
  }
  
  // Get ticket count
  const ticketCount = (db.tickets.filter(t => t.guildId === guild.id).length || 0) + 1;
  
  // Create ticket channel
  const ticketChannel = await guild.channels.create({
    name: `ticket-${ticketCount}`,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
      },
      {
        id: client.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
      }
    ]
  });
  
  // Add permissions for admin roles
  for (const roleId of categoryConfig.adminRoles) {
    await ticketChannel.permissionOverwrites.create(roleId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
  }
  
  // Create ticket embed
  const embed = new EmbedBuilder()
    .setTitle(`${categoryConfig.emoji} تذكرة جديدة: #${ticketCount}`)
    .setDescription(`مرحباً ${interaction.user}, شكراً لإنشاء تذكرة. سيقوم فريق الإدارة بالرد عليك في أقرب وقت ممكن.`)
    .setColor('#2f3136')
    .setTimestamp();
  
  // Create ticket management buttons
  const claimButton = new ButtonBuilder()
    .setCustomId('claim_ticket')
    .setLabel('استلام')
    .setStyle(ButtonStyle.Success);
  
  const unclaimButton = new ButtonBuilder()
    .setCustomId('unclaim_ticket')
    .setLabel('إلغاء الاستلام')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);
  
  const callMemberButton = new ButtonBuilder()
    .setCustomId('call_member')
    .setLabel('استدعاء عضو')
    .setStyle(ButtonStyle.Primary);
  
  const row = new ActionRowBuilder().addComponents(claimButton, unclaimButton, callMemberButton);
  
  // Send initial message
  const message = await ticketChannel.send({ embeds: [embed], components: [row] });
  
  // Save ticket to database
  db.tickets.push({
    id: ticketChannel.id,
    number: ticketCount,
    guildId: guild.id,
    userId: interaction.user.id,
    categoryId: categoryId,
    claimed: false,
    claimedBy: null,
    claimedAt: null,
    createdAt: Date.now()
  });
  
  saveDatabase();
  
  // Reply to user
  await interaction.editReply({ content: `تم إنشاء تذكرتك بنجاح! ${ticketChannel}`, ephemeral: true });
}

// Function to claim a ticket
async function claimTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const ticketData = db.tickets.find(t => t.id === interaction.channel.id);
  
  if (!ticketData) {
    return interaction.editReply({ content: 'هذه القناة ليست تذكرة!', ephemeral: true });
  }
  
  // Check if user has permission to claim
  const categoryConfig = db.categories.find(c => c.id === ticketData.categoryId);
  let hasPermission = false;
  
  for (const roleId of categoryConfig.adminRoles) {
    if (interaction.member.roles.cache.has(roleId)) {
      hasPermission = true;
      break;
    }
  }
  
  if (!hasPermission) {
    return interaction.editReply({ content: 'ليس لديك صلاحية لاستلام التذاكر!', ephemeral: true });
  }
  
  // Check if ticket is already claimed
  if (ticketData.claimed) {
    return interaction.editReply({ content: 'هذه التذكرة مستلمة بالفعل!', ephemeral: true });
  }
  
  // Update ticket data
  ticketData.claimed = true;
  ticketData.claimedBy = interaction.user.id;
  ticketData.claimedAt = Date.now();
  
  // Update admin stats
  if (!db.stats[interaction.user.id]) {
    db.stats[interaction.user.id] = {
      claimedTickets: 0,
      lastClaimedAt: null
    };
  }
  
  db.stats[interaction.user.id].claimedTickets++;
  db.stats[interaction.user.id].lastClaimedAt = Date.now();
  
  saveDatabase();
  
  // Update buttons
  const message = (await interaction.channel.messages.fetch()).find(m => m.author.id === client.user.id);
  
  if (message) {
    const claimButton = ButtonBuilder.from(message.components[0].components[0])
      .setDisabled(true);
    
    const unclaimButton = ButtonBuilder.from(message.components[0].components[1])
      .setDisabled(false);
    
    const callMemberButton = ButtonBuilder.from(message.components[0].components[2]);
    
    const row = new ActionRowBuilder().addComponents(claimButton, unclaimButton, callMemberButton);
    
    await message.edit({ components: [row] });
  }
  
  // Announce claim
  const embed = new EmbedBuilder()
    .setTitle('تم استلام التذكرة')
    .setDescription(`تم استلام هذه التذكرة بواسطة ${interaction.user}`)
    .setColor('#2ecc71')
    .setTimestamp();
  
  await interaction.channel.send({ embeds: [embed] });
  
  return interaction.editReply({ content: 'تم استلام التذكرة بنجاح!', ephemeral: true });
}

// Function to unclaim a ticket
async function unclaimTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const ticketData = db.tickets.find(t => t.id === interaction.channel.id);
  
  if (!ticketData) {
    return interaction.editReply({ content: 'هذه القناة ليست تذكرة!', ephemeral: true });
  }
  
  // Check if user has permission to unclaim
  const categoryConfig = db.categories.find(c => c.id === ticketData.categoryId);
  let hasPermission = false;
  
  for (const roleId of categoryConfig.adminRoles) {
    if (interaction.member.roles.cache.has(roleId)) {
      hasPermission = true;
      break;
    }
  }
  
  if (!hasPermission) {
    return interaction.editReply({ content: 'ليس لديك صلاحية لإلغاء استلام التذاكر!', ephemeral: true });
  }
  
  // Check if ticket is claimed
  if (!ticketData.claimed) {
    return interaction.editReply({ content: 'هذه التذكرة غير مستلمة بالفعل!', ephemeral: true });
  }
  
  // Update ticket data
  ticketData.claimed = false;
  ticketData.claimedBy = null;
  ticketData.claimedAt = null;
  
  saveDatabase();
  
  // Update buttons
  const message = (await interaction.channel.messages.fetch()).find(m => m.author.id === client.user.id);
  
  if (message) {
    const claimButton = ButtonBuilder.from(message.components[0].components[0])
      .setDisabled(false);
    
    const unclaimButton = ButtonBuilder.from(message.components[0].components[1])
      .setDisabled(true);
    
    const callMemberButton = ButtonBuilder.from(message.components[0].components[2]);
    
    const row = new ActionRowBuilder().addComponents(claimButton, unclaimButton, callMemberButton);
    
    await message.edit({ components: [row] });
  }
  
  // Announce unclaim
  const embed = new EmbedBuilder()
    .setTitle('تم إلغاء استلام التذكرة')
    .setDescription(`تم إلغاء استلام هذه التذكرة`)
    .setColor('#e74c3c')
    .setTimestamp();
  
  await interaction.channel.send({ embeds: [embed] });
  
  return interaction.editReply({ content: 'تم إلغاء استلام التذكرة بنجاح!', ephemeral: true });
}

// Function to call a member to the ticket
async function callMember(interaction) {
  await interaction.deferReply({ ephemeral: true });
  
  const ticketData = db.tickets.find(t => t.id === interaction.channel.id);
  
  if (!ticketData) {
    return interaction.editReply({ content: 'هذه القناة ليست تذكرة!', ephemeral: true });
  }
  
  // Create modal for user to input member ID
  const modal = new ModalBuilder()
    .setCustomId('call_member_modal')
    .setTitle('استدعاء عضو');
  
  const memberIdInput = new TextInputBuilder()
    .setCustomId('member_id')
    .setLabel('معرف العضو')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('أدخل معرف العضو المراد استدعاؤه')
    .setRequired(true);
  
  const firstActionRow = new ActionRowBuilder().addComponents(memberIdInput);
  modal.addComponents(firstActionRow);
  
  await interaction.showModal(modal);
}

// Handle modal submissions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;
  
  if (interaction.customId === 'call_member_modal') {
    const memberId = interaction.fields.getTextInputValue('member_id');
    
    // Get guild member
    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
    
    if (!member) {
      return interaction.reply({ content: 'لم يتم العثور على العضو!', ephemeral: true });
    }
    
    // Send DM to the member
    try {
      const embed = new EmbedBuilder()
        .setTitle('استدعاء إلى تذكرة')
        .setDescription(`تم استدعاؤك بواسطة ${interaction.user} إلى تذكرة في سيرفر ${interaction.guild.name}`)
        .setColor('#3498db')
        .addFields(
          { name: 'رابط التذكرة', value: `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}` }
        )
        .setTimestamp();
      
      await member.send({ embeds: [embed] });
      
      // Announce in ticket
      const ticketEmbed = new EmbedBuilder()
        .setTitle('تم استدعاء عضو')
        .setDescription(`تم استدعاء ${member} إلى هذه التذكرة بواسطة ${interaction.user}`)
        .setColor('#3498db')
        .setTimestamp();
      
      await interaction.channel.send({ embeds: [ticketEmbed] });
      
      return interaction.reply({ content: `تم استدعاء ${member.user.tag} بنجاح!`, ephemeral: true });
    } catch (error) {
      return interaction.reply({ content: 'لا يمكن إرسال رسالة خاصة إلى هذا العضو!', ephemeral: true });
    }
  }
});

// Function to show ticket stats
async function showTicketStats(message, args) {
  // Check if argument is provided
  if (!args[0]) {
    return message.reply('الرجاء تحديد معرف المستخدم أو المنشن.');
  }
  
  // Get user ID from mention or argument
  let userId = args[0].replace(/[<@!>]/g, '');
  
  // Get user stats
  const stats = db.stats[userId] || { claimedTickets: 0, lastClaimedAt: null };
  
  // Get user
  const user = await message.client.users.fetch(userId).catch(() => null);
  
  if (!user) {
    return message.reply('لم يتم العثور على المستخدم!');
  }
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle(`إحصائيات التذاكر لـ ${user.tag}`)
    .setColor('#3498db')
    .addFields(
      { name: 'عدد التذاكر المستلمة', value: `${stats.claimedTickets || 0}`, inline: true },
      { name: 'آخر استلام تذكرة', value: stats.lastClaimedAt ? `<t:${Math.floor(stats.lastClaimedAt / 1000)}:R>` : 'لم يستلم أي تذكرة', inline: true }
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();
  
  return message.reply({ embeds: [embed] });
}

// Function to show top ticket handlers
async function showTopTicketHandlers(message) {
  // Get all stats
  const statsEntries = Object.entries(db.stats);
  
  // Sort by claimed tickets
  statsEntries.sort((a, b) => (b[1].claimedTickets || 0) - (a[1].claimedTickets || 0));
  
  // Get top 10
  const top10 = statsEntries.slice(0, 10);
  
  if (top10.length === 0) {
    return message.reply('لا توجد إحصائيات تذاكر بعد!');
  }
  
  // Create embed
  const embed = new EmbedBuilder()
    .setTitle('أكثر المشرفين استلاماً للتذاكر')
    .setColor('#3498db')
    .setTimestamp();
  
  // Add fields for each admin
  for (let i = 0; i < top10.length; i++) {
    const [userId, stats] = top10[i];
    
    // Get user
    const user = await message.client.users.fetch(userId).catch(() => null);
    
    if (user) {
      embed.addFields(
        { name: `#${i + 1} - ${user.tag}`, value: `التذاكر المستلمة: ${stats.claimedTickets || 0}`, inline: false }
      );
    }
  }
  
  return message.reply({ embeds: [embed] });
}

// Start the bot
client.login(config.token);

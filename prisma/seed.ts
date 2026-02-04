import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Rally Live database...");

  // Clear existing data
  await prisma.$transaction([
    prisma.creditAuditLog.deleteMany(),
    prisma.credit.deleteMany(),
    prisma.liveChatMessage.deleteMany(),
    prisma.liveParticipant.deleteMany(),
    prisma.moderator.deleteMany(),
    prisma.liveStream.deleteMany(),
    prisma.serviceOrder.deleteMany(),
    prisma.service.deleteMany(),
    prisma.messageStreak.deleteMany(),
    prisma.message.deleteMany(),
    prisma.like.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.follow.deleteMany(),
    prisma.block.deleteMany(),
    prisma.report.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.adSettings.deleteMany(),
    prisma.wallet.deleteMany(),
    prisma.video.deleteMany(),
    prisma.series.deleteMany(),
    prisma.session.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash("password123", 12);

  // ── Create Users ──
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: "richardhabermehl2016@gmail.com",
        username: "kingrichard",
        displayName: "KIngRichard",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-1.jpg",
        bio: "Owner of Rally Live. Building the future of live streaming.",
        isCreator: true,
        verifiedBadge: true,
        isOwner: true,
        followerCount: 0,
        followingCount: 0,
        wallet: { create: { balanceCents: 0, credits: 0, totalEarned: 0 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "streamqueen@gmail.com",
        username: "streamqueen",
        displayName: "Stream Queen",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-2.jpg",
        bio: "Professional streamer and digital artist. Come hang out in my streams!",
        isCreator: true,
        verifiedBadge: true,
        followerCount: 18700,
        followingCount: 245,
        wallet: { create: { balanceCents: 89000, credits: 3200, totalEarned: 175000 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "gamerpro@gmail.com",
        username: "gamerpro99",
        displayName: "GamerPro99",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-3.jpg",
        bio: "Competitive gamer and content creator. FPS specialist.",
        isCreator: true,
        verifiedBadge: false,
        followerCount: 8900,
        followingCount: 567,
        wallet: { create: { balanceCents: 45000, credits: 1500, totalEarned: 92000 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "musicmaker@gmail.com",
        username: "musicmaker",
        displayName: "Music Maker",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-4.jpg",
        bio: "Producer and musician. Sharing beats and vibes.",
        isCreator: true,
        verifiedBadge: true,
        followerCount: 31200,
        followingCount: 189,
        wallet: { create: { balanceCents: 220000, credits: 8000, totalEarned: 450000 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "techtalks@gmail.com",
        username: "techtalks",
        displayName: "Tech Talks",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-5.jpg",
        bio: "Breaking down the latest in tech. Reviews, tutorials, and deep dives.",
        isCreator: true,
        verifiedBadge: false,
        followerCount: 12300,
        followingCount: 432,
        wallet: { create: { balanceCents: 67000, credits: 2100, totalEarned: 130000 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "fitlife@gmail.com",
        username: "fitlife",
        displayName: "Fit Life",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-6.jpg",
        bio: "Fitness coach and lifestyle content creator. Transform your life!",
        isCreator: true,
        verifiedBadge: true,
        followerCount: 45000,
        followingCount: 156,
        wallet: { create: { balanceCents: 340000, credits: 12000, totalEarned: 680000 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "artworld@gmail.com",
        username: "artworld",
        displayName: "Art World",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-7.jpg",
        bio: "Digital and traditional artist. Watch me create from scratch.",
        isCreator: true,
        verifiedBadge: false,
        followerCount: 6700,
        followingCount: 890,
        wallet: { create: { balanceCents: 23000, credits: 800, totalEarned: 45000 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "cookwithme@gmail.com",
        username: "cookwithme",
        displayName: "Cook With Me",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-8.jpg",
        bio: "Chef and food content creator. Easy recipes for everyone.",
        isCreator: true,
        verifiedBadge: true,
        followerCount: 22100,
        followingCount: 278,
        wallet: { create: { balanceCents: 156000, credits: 4500, totalEarned: 310000 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "viewer1@gmail.com",
        username: "viewer_jane",
        displayName: "Jane Smith",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-9.jpg",
        bio: "Rally Live enthusiast. Love watching streams and supporting creators!",
        isCreator: false,
        verifiedBadge: false,
        followerCount: 45,
        followingCount: 234,
        wallet: { create: { balanceCents: 5000, credits: 500 } },
      },
    }),
    prisma.user.create({
      data: {
        email: "viewer2@gmail.com",
        username: "viewer_mike",
        displayName: "Mike Johnson",
        passwordHash,
        avatarUrl: "/uploads/avatars/default-10.jpg",
        bio: "Just here for the content.",
        isCreator: false,
        verifiedBadge: false,
        followerCount: 12,
        followingCount: 156,
        wallet: { create: { balanceCents: 2000, credits: 200 } },
      },
    }),
  ]);

  console.log(`Created ${users.length} users`);

  // ── Create Series ──
  const series1 = await prisma.series.create({
    data: {
      title: "Mastering Live Streaming",
      description: "A complete guide to becoming a successful live streamer on Rally Live. From setup to monetization.",
      creatorId: users[0].id,
      totalEpisodes: 5,
    },
  });

  const series2 = await prisma.series.create({
    data: {
      title: "Digital Art Fundamentals",
      description: "Learn digital art from the ground up. Covering tools, techniques, and creative processes.",
      creatorId: users[6].id,
      totalEpisodes: 4,
    },
  });

  const series3 = await prisma.series.create({
    data: {
      title: "Meal Prep Masterclass",
      description: "Weekly meal prep ideas that save time and money. Healthy, delicious, and easy to make.",
      creatorId: users[7].id,
      totalEpisodes: 3,
    },
  });

  console.log("Created 3 series");

  // ── Create Videos ──
  const videoData = [
    // Rally King's series videos
    { title: "Getting Started with Live Streaming", description: "Everything you need to know to start your streaming journey. Equipment, software, and first steps.", durationSec: 845, creatorId: users[0].id, views: 156000, likes: 8900, dislikes: 120, commentsCount: 342, tags: ["streaming", "tutorial", "beginner"], seriesId: series1.id, seriesOrder: 1 },
    { title: "Building Your Audience from Zero", description: "Strategies for growing your viewer base when you're just starting out.", durationSec: 1220, creatorId: users[0].id, views: 98000, likes: 6200, dislikes: 89, commentsCount: 256, tags: ["growth", "audience", "tips"], seriesId: series1.id, seriesOrder: 2 },
    { title: "Monetization Strategies for Creators", description: "How to turn your content into revenue. Credits, donations, subscriptions, and more.", durationSec: 960, creatorId: users[0].id, views: 134000, likes: 7800, dislikes: 156, commentsCount: 478, tags: ["money", "monetization", "creator"], seriesId: series1.id, seriesOrder: 3 },
    { title: "Advanced OBS Settings for Rally Live", description: "Deep dive into OBS configuration for the best streaming quality.", durationSec: 1540, creatorId: users[0].id, views: 67000, likes: 4100, dislikes: 67, commentsCount: 189, tags: ["obs", "settings", "quality"], seriesId: series1.id, seriesOrder: 4 },
    { title: "Engaging Your Chat in Real Time", description: "Tips for keeping your audience engaged and coming back for more.", durationSec: 780, creatorId: users[0].id, views: 89000, likes: 5600, dislikes: 45, commentsCount: 312, tags: ["engagement", "chat", "community"], seriesId: series1.id, seriesOrder: 5 },

    // Stream Queen videos
    { title: "My Setup Tour 2026", description: "Full tour of my streaming setup. Every piece of gear I use daily.", durationSec: 620, creatorId: users[1].id, views: 210000, likes: 12400, dislikes: 230, commentsCount: 567, tags: ["setup", "gear", "tour"] },
    { title: "Battle Royale: Stream Queen vs GamerPro", description: "Epic live battle highlights from last week's showdown.", durationSec: 1890, creatorId: users[1].id, views: 345000, likes: 19800, dislikes: 890, commentsCount: 1234, tags: ["battle", "highlights", "gaming"] },

    // GamerPro videos
    { title: "Top 10 FPS Tips for Beginners", description: "Essential tips to improve your aim and game sense in any FPS.", durationSec: 540, creatorId: users[2].id, views: 78000, likes: 4500, dislikes: 123, commentsCount: 234, tags: ["fps", "tips", "gaming", "beginner"] },
    { title: "Ranked Grind: Road to Top 500", description: "Follow my journey to the top of the leaderboard.", durationSec: 2400, creatorId: users[2].id, views: 45000, likes: 2800, dislikes: 67, commentsCount: 178, tags: ["ranked", "competitive", "grind"] },

    // Music Maker videos
    { title: "Making a Beat from Scratch in 10 Minutes", description: "Watch me produce a full beat in real time. FL Studio workflow.", durationSec: 680, creatorId: users[3].id, views: 289000, likes: 16700, dislikes: 234, commentsCount: 789, tags: ["music", "production", "beat", "fl-studio"] },
    { title: "How I Got My First 10K Followers", description: "My story and the strategies that worked for growing on Rally Live.", durationSec: 920, creatorId: users[3].id, views: 167000, likes: 9800, dislikes: 156, commentsCount: 534, tags: ["growth", "story", "creator"] },

    // Tech Talks videos
    { title: "Rally Live Platform Deep Dive", description: "Comprehensive review of Rally Live's features for new creators.", durationSec: 1100, creatorId: users[4].id, views: 56000, likes: 3400, dislikes: 89, commentsCount: 167, tags: ["review", "platform", "rally-live"] },
    { title: "Best Budget Streaming Gear 2026", description: "You don't need expensive equipment to start streaming. Here's my budget picks.", durationSec: 840, creatorId: users[4].id, views: 123000, likes: 7200, dislikes: 134, commentsCount: 345, tags: ["budget", "gear", "streaming"] },

    // Fit Life videos
    { title: "30-Day Transformation Challenge", description: "Join me for a complete body transformation. Day 1 starts now!", durationSec: 450, creatorId: users[5].id, views: 567000, likes: 34500, dislikes: 890, commentsCount: 2345, tags: ["fitness", "challenge", "transformation"] },
    { title: "Home Workout: No Equipment Needed", description: "Full body workout you can do anywhere with zero equipment.", durationSec: 1800, creatorId: users[5].id, views: 890000, likes: 52000, dislikes: 1200, commentsCount: 4567, tags: ["workout", "home", "fitness", "bodyweight"] },

    // Art World series videos
    { title: "Choosing Your Digital Art Tools", description: "Comparing tablets, software, and brushes for digital art.", durationSec: 720, creatorId: users[6].id, views: 34000, likes: 2100, dislikes: 45, commentsCount: 123, tags: ["art", "tools", "digital"], seriesId: series2.id, seriesOrder: 1 },
    { title: "Color Theory for Digital Artists", description: "Understanding color relationships and how to use them effectively.", durationSec: 950, creatorId: users[6].id, views: 28000, likes: 1800, dislikes: 34, commentsCount: 98, tags: ["art", "color", "theory"], seriesId: series2.id, seriesOrder: 2 },
    { title: "Anatomy Basics: Drawing the Human Figure", description: "Fundamentals of human anatomy for artists.", durationSec: 1340, creatorId: users[6].id, views: 42000, likes: 2900, dislikes: 56, commentsCount: 156, tags: ["art", "anatomy", "drawing"], seriesId: series2.id, seriesOrder: 3 },
    { title: "Creating a Complete Character Design", description: "From concept to finished character. Full walkthrough.", durationSec: 1680, creatorId: users[6].id, views: 51000, likes: 3400, dislikes: 67, commentsCount: 234, tags: ["art", "character", "design"], seriesId: series2.id, seriesOrder: 4 },

    // Cook With Me series videos
    { title: "Sunday Meal Prep: 5 Lunches in 1 Hour", description: "Prepare an entire week of healthy lunches in just one hour.", durationSec: 890, creatorId: users[7].id, views: 234000, likes: 14500, dislikes: 234, commentsCount: 678, tags: ["cooking", "meal-prep", "healthy"], seriesId: series3.id, seriesOrder: 1 },
    { title: "Budget Meal Prep Under $30", description: "Feed yourself for a week on less than $30. Delicious and nutritious.", durationSec: 760, creatorId: users[7].id, views: 189000, likes: 11200, dislikes: 189, commentsCount: 534, tags: ["cooking", "budget", "meal-prep"], seriesId: series3.id, seriesOrder: 2 },
    { title: "High Protein Meal Prep for Gains", description: "Meal prep designed for muscle building. 150g+ protein daily.", durationSec: 1020, creatorId: users[7].id, views: 156000, likes: 9800, dislikes: 167, commentsCount: 456, tags: ["cooking", "protein", "fitness", "meal-prep"], seriesId: series3.id, seriesOrder: 3 },
  ];

  const videos = [];
  for (const vd of videoData) {
    const v = await prisma.video.create({
      data: {
        ...vd,
        tags: vd.tags,
        status: "READY",
        visibility: "PUBLIC",
        uploadDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      },
    });
    videos.push(v);
  }

  console.log(`Created ${videos.length} videos`);

  // ── Set autoplay next for series ──
  for (let i = 0; i < videos.length - 1; i++) {
    if (videos[i].seriesId && videos[i + 1].seriesId === videos[i].seriesId) {
      await prisma.video.update({
        where: { id: videos[i].id },
        data: { autoplayNextId: videos[i + 1].id },
      });
    }
  }

  // ── Create some follows ──
  const followPairs = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 5],
    [9, 0], [9, 1], [9, 4], [9, 5], [9, 7],
    [0, 1], [0, 3], [1, 0], [1, 5], [2, 0],
    [3, 0], [3, 1], [4, 0], [5, 3], [6, 0],
    [7, 0], [7, 5],
  ];

  for (const [followerIdx, followingIdx] of followPairs) {
    await prisma.follow.create({
      data: {
        followerId: users[followerIdx].id,
        followingId: users[followingIdx].id,
      },
    });
  }

  console.log(`Created ${followPairs.length} follows`);

  // ── Create some comments ──
  const commentTexts = [
    "This is incredible content! Keep it up!",
    "Learned so much from this video, thank you!",
    "Can you do a follow-up on this topic?",
    "Best creator on Rally Live, hands down.",
    "The production quality just keeps getting better.",
    "I've watched this three times already.",
    "This changed my perspective completely.",
    "Extremely helpful breakdown, thanks for sharing.",
    "More of this please!",
    "Subscribed and hit the bell!",
    "Your editing has improved so much.",
    "This is why I love Rally Live.",
    "Can we get a collab with Stream Queen?",
    "The tips at 5:30 were game changing.",
    "Been following since day one. So proud!",
  ];

  let commentCount = 0;
  for (const video of videos) {
    const numComments = Math.floor(Math.random() * 6) + 2;
    for (let i = 0; i < numComments; i++) {
      const randomUser = users[Math.floor(Math.random() * users.length)];
      if (randomUser.id === video.creatorId) continue;
      await prisma.comment.create({
        data: {
          userId: randomUser.id,
          videoId: video.id,
          text: commentTexts[Math.floor(Math.random() * commentTexts.length)],
          likes: Math.floor(Math.random() * 50),
          createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        },
      });
      commentCount++;
    }
  }

  console.log(`Created ${commentCount} comments`);

  // ── Create some services ──
  const serviceData = [
    { creatorId: users[0].id, title: "1-on-1 Streaming Coaching", description: "Personal coaching session to help you level up your stream. We'll cover setup, engagement, and growth strategies.", category: "COACHING" as const, priceCredits: 5000, deliveryDays: 3 },
    { creatorId: users[1].id, title: "Custom Digital Portrait", description: "A hand-drawn digital portrait in my signature style. Perfect for profile pictures or gifts.", category: "CUSTOM_CONTENT" as const, priceCredits: 3000, deliveryDays: 7 },
    { creatorId: users[3].id, title: "Custom Beat Production", description: "I'll produce a custom beat in any genre. Includes 2 revisions.", category: "CUSTOM_CONTENT" as const, priceCredits: 10000, deliveryDays: 14 },
    { creatorId: users[5].id, title: "Personal Training Plan", description: "Custom workout and nutrition plan tailored to your goals.", category: "COACHING" as const, priceCredits: 8000, deliveryDays: 5 },
    { creatorId: users[0].id, title: "Shoutout on My Stream", description: "I'll give you a shoutout during my next live stream to my 25K+ viewers.", category: "SHOUTOUT" as const, priceCredits: 2000, deliveryDays: 7 },
    { creatorId: users[4].id, title: "Tech Video Review", description: "I'll review your tech setup or content and provide detailed feedback.", category: "VIDEO_REVIEW" as const, priceCredits: 4000, deliveryDays: 5 },
  ];

  for (const sd of serviceData) {
    await prisma.service.create({ data: sd });
  }

  console.log(`Created ${serviceData.length} services`);

  // ── Create Ad Settings for qualifying creators ──
  for (const user of users.filter(u => u.isCreator && u.followerCount >= 10000)) {
    const pct = user.followerCount >= 20000 ? 80 : 50;
    await prisma.adSettings.create({
      data: {
        userId: user.id,
        revenueSharePct: pct,
        adsPerVideo: 1,
        adsPerLiveHour: 2,
        creditsToSkip: 200,
      },
    });
  }

  console.log("Created ad settings for qualifying creators");

  // ── Create some notifications ──
  await prisma.notification.createMany({
    data: [
      { userId: users[0].id, type: "FOLLOW", message: "Jane Smith started following you", relatedId: users[8].id },
      { userId: users[0].id, type: "LIKE", message: "Your video 'Getting Started with Live Streaming' got 100 new likes", relatedId: videos[0].id },
      { userId: users[0].id, type: "COMMENT", message: "Mike Johnson commented on your video", relatedId: videos[0].id },
      { userId: users[0].id, type: "DONATION", message: "Stream Queen sent you 500 credits!", relatedId: users[1].id },
      { userId: users[0].id, type: "SYSTEM", message: "Welcome to Rally Live! Complete your profile to get started." },
    ],
  });

  console.log("Created notifications");

  console.log("\nSeeding complete!");
  console.log("Default login for all users: password123");
  console.log("Main test account: rallyking@gmail.com / password123");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

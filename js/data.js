/* ==========================================================================
   SSV GYM — FALLBACK / SAMPLE DATA
   --------------------------------------------------------------------------
   Used ONLY when the Apps Script API is not configured or can't be reached
   and the browser has no saved copy of real content. Every value here is a
   PLACEHOLDER. None of it is real SSV information.

   Real content lives in the Google Sheet and is edited from admin.html.
   apps-script/Code.gs seeds the sheet with the same structure.
   Lists use " | " between items (a new line works too).
   ========================================================================== */
const FALLBACK_DATA = Object.freeze({
  general: {
    gym_name: "SSV Gym",
    full_name: "Shree Siddhi Vinayak Gym",
    tagline: "Train strong. Live strong.",
    description: "A fitness space for strength, conditioning and wellness.",
    hero_heading: "Train strong. | Live strong.",
    hero_subtitle: "A complete fitness space for strength, conditioning and wellness.",
    // Photos: Unsplash stock images (free licence), stand-ins until real SSV photos are uploaded.
    hero_image: "https://images.unsplash.com/photo-1623874514711-0f321325f318",
    facility_strip: "Main Gym | CrossFit | Steam Room",
    about_heading: "Shree Siddhi Vinayak Gym",
    about_text: "SSV Gym is a fitness space focused on strength training, conditioning and overall fitness. | Train on the main gym floor, build conditioning in the CrossFit and functional training area, and recover in the steam room.",
    about_image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48",
    about_highlights: "Quality Equipment | Dedicated Training Areas | Trainer Support | Fitness-focused Environment",
    facilities_intro: "The main gym floor, a CrossFit and functional training zone, and a steam room for recovery.",
    stat_1_value: "10+", stat_1_label: "Years of Fitness",
    stat_2_value: "20+", stat_2_label: "Training Machines",
    stat_3_value: "500+", stat_3_label: "Members",
    stat_4_value: "2", stat_4_label: "Training Zones",
    // Dummy contact details. The all-zero number is deliberate so no real person gets calls.
    phone: "+91 00000 00000",
    whatsapp: "+91 00000 00000",
    address: "Shop No. 1, Sample Complex, Main Road | City, State 000000",
    opening_hours: "Mon – Sat: 6:00 AM – 10:00 PM | Sunday: 7:00 AM – 12:00 PM",
    maps_url: "https://www.google.com/maps/search/?api=1&query=Shree+Siddhi+Vinayak+Gym",
    maps_embed_url: "",
    instagram_url: "https://www.instagram.com/",
    featured_badge_text: "Best value",
    sample_content: true
  },

  facilities: [
    { id: "fac-main", name: "Main Gym", tags: "Strength | Cardio | Equipment", description: "The main training floor for strength work, cardio and machine training.", image_url: "https://images.unsplash.com/photo-1637430308606-86576d8fef3c", category: "major", active: true, display_order: 1 },
    { id: "fac-crossfit", name: "CrossFit", tags: "Functional Training | Conditioning", description: "A dedicated area for functional movements, circuits and conditioning.", image_url: "https://images.unsplash.com/photo-1536922246289-88c42f957773", category: "major", active: true, display_order: 2 },
    { id: "fac-steam", name: "Steam Room", tags: "Recovery | Relaxation", description: "Unwind after training and support recovery in the steam room.", image_url: "https://images.unsplash.com/photo-1759216852954-88e547b8e01f", category: "major", active: true, display_order: 3 },
    { id: "fac-cardio", name: "Cardio Area", tags: "", description: "Treadmills, bikes and cross-trainers for warm-ups and endurance work.", image_url: "", category: "additional", active: true, display_order: 4 },
    { id: "fac-weights", name: "Free Weights", tags: "", description: "Dumbbells, barbells and benches for free-weight training.", image_url: "", category: "additional", active: true, display_order: 5 },
    { id: "fac-machines", name: "Strength Machines", tags: "", description: "Machines for training every major muscle group.", image_url: "", category: "additional", active: true, display_order: 6 }
  ],

  plans: [
    { id: "plan-monthly", name: "Monthly", duration: "1 Month", price: 1200, description: "Flexible month-to-month access.", features: "Gym Access | Equipment Access | Trainer Assistance", featured: false, active: true, display_order: 1 },
    { id: "plan-quarterly", name: "Quarterly", duration: "3 Months", price: 3000, description: "Three months to build a steady routine.", features: "Gym Access | Equipment Access | Trainer Assistance", featured: false, active: true, display_order: 2 },
    { id: "plan-half-yearly", name: "Half Yearly", duration: "6 Months", price: 5500, description: "Six months of consistent training.", features: "Gym Access | Equipment Access | Trainer Assistance", featured: false, active: true, display_order: 3 },
    { id: "plan-yearly", name: "Yearly", duration: "12 Months", price: 9000, description: "The lowest monthly cost, for committed members.", features: "Gym Access | Equipment Access | Trainer Assistance", featured: true, active: true, display_order: 4 }
  ],

  trainers: [
    // Made-up names with stock photos. Replace with the real trainers (with their consent).
    { id: "tr-1", name: "Aman Verma", role: "Fitness Trainer", specialization: "General fitness and fat loss", bio: "Helps new members build a routine with sound technique and steady progress.", image_url: "https://images.unsplash.com/photo-1577221084712-45b0445d2b00", active: true, display_order: 1 },
    { id: "tr-2", name: "Neha Kulkarni", role: "CrossFit Coach", specialization: "Functional training and conditioning", bio: "Runs circuit and conditioning sessions in the CrossFit area.", image_url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5", active: true, display_order: 2 },
    { id: "tr-3", name: "Vikram Singh", role: "Strength Trainer", specialization: "Strength training and barbell basics", bio: "Coaches the main lifts with a focus on form and safe progression.", image_url: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd", active: true, display_order: 3 }
  ],

  gallery: [
    { id: "img-1", image_url: "https://images.unsplash.com/photo-1728486145245-d4cb0c9c3470", title: "Main gym floor", category: "gym", caption: "Machines and free weights on the main floor.", active: true, display_order: 1 },
    { id: "img-2", image_url: "https://images.unsplash.com/photo-1548690312-e3b507d8c110", title: "Battle ropes", category: "crossfit", caption: "Conditioning work in the CrossFit area.", active: true, display_order: 2 },
    { id: "img-3", image_url: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f", title: "Strength machines", category: "equipment", caption: "Machines for full-body training.", active: true, display_order: 3 },
    { id: "img-4", image_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438", title: "Barbell session", category: "training", caption: "Setting up for a heavy lift.", active: true, display_order: 4 },
    { id: "img-5", image_url: "https://images.unsplash.com/photo-1576678927484-cc907957088c", title: "Dumbbell rack", category: "equipment", caption: "Dumbbells for every level.", active: true, display_order: 5 },
    { id: "img-6", image_url: "https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3", title: "Kettlebell work", category: "crossfit", caption: "Functional movement with kettlebells.", active: true, display_order: 6 },
    { id: "img-7", image_url: "https://images.unsplash.com/photo-1689877020200-403d8542d95d", title: "Weights area", category: "gym", caption: "Racks, benches and plates.", active: true, display_order: 7 },
    { id: "img-8", image_url: "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5", title: "Focused training", category: "training", caption: "Hard work on the gym floor.", active: true, display_order: 8 },
    { id: "img-9", image_url: "https://images.unsplash.com/photo-1759216852954-88e547b8e01f", title: "Steam room", category: "gym", caption: "Recovery after training.", active: true, display_order: 9 },
    { id: "img-10", image_url: "https://images.unsplash.com/photo-1593079831268-3381b0db4a77", title: "Member event", category: "events", caption: "Decorated for a gym celebration.", active: true, display_order: 10 },
    { id: "img-11", image_url: "https://images.unsplash.com/photo-1590487988256-9ed24133863e", title: "Equipment detail", category: "equipment", caption: "Close-up of the training equipment.", active: true, display_order: 11 },
    { id: "img-12", image_url: "https://images.unsplash.com/photo-1605296867304-46d5465a13f1", title: "Lifting practice", category: "training", caption: "Barbell work in the training area.", active: true, display_order: 12 }
  ],

  testimonials: [
    // Dummy reviews. While sample_content is on, the page labels them as placeholder reviews.
    { id: "rev-1", name: "Rohit P.", review: "Well-maintained equipment and a serious training atmosphere. The trainers check your form without being asked.", rating: 5, image_url: "", active: true, display_order: 1 },
    { id: "rev-2", name: "Sneha D.", review: "The CrossFit area is my favourite part of the gym. Sessions are tough but well planned.", rating: 5, image_url: "", active: true, display_order: 2 },
    { id: "rev-3", name: "Karan M.", review: "Clean, bright and easy to train in, even in the mornings. The steam room after a workout is a bonus.", rating: 4, image_url: "", active: true, display_order: 3 }
  ],

  announcements: [
    { id: "ann-1", title: "Welcome to the new SSV Gym website", description: "Membership details, timings and gym updates will be posted here.", date: "2026-09-23", expiry: "", active: true, priority: 1 }
  ]
});

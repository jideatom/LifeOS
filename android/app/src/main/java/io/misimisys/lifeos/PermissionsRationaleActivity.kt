package io.misimisys.lifeos

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        title = "LifeOS health access"

        val density = resources.displayMetrics.density
        val padding = (24 * density).toInt()

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
        }

        val headline = TextView(this).apply {
            text = "LifeOS uses Health Connect to read steps, sleep, calories, distance, workouts, weight, and resting heart rate from your phone."
            textSize = 18f
        }

        val body = TextView(this).apply {
            text =
                "This data is used only to update your LifeOS dashboard and shared progress data. You stay in control and can revoke access at any time in Health Connect."
            textSize = 15f
            setPadding(0, (16 * density).toInt(), 0, (24 * density).toInt())
        }

        val privacyButton = Button(this).apply {
            text = "Open privacy page"
            setOnClickListener {
                startActivity(
                    Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse("https://misimisys.github.io/LifeOS/")
                    )
                )
            }
        }

        val doneButton = Button(this).apply {
            text = "Done"
            setOnClickListener { finish() }
        }

        container.addView(headline)
        container.addView(body)
        container.addView(privacyButton)
        container.addView(doneButton)

        setContentView(
            ScrollView(this).apply {
                addView(container)
            }
        )
    }
}
